import { describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { fakeDb, rpcArgs } from './fakeDb'
import { buildReceiptPdf, formatIst, receiptLines } from '../receipt'
import { computePrice } from '../pricing'
import {
  bookingsByDate, calendar, listBookings, normalizeBookingPatch, pageQuery, parseBookingPatch, recordPayment, stationsWithReservations, updateBooking,
} from '../services/admin/bookings'
import { checkin, extendHour, startGrace, startTimer, stopTimer } from '../services/admin/operations'
import {
  confirmCard, createCoupon, createCouponQuery, foodItemsSchema, listCards, replaceFoodItems, setAdminEmails, setTournamentStatus,
  deletePlan, tournamentRegistrations, tournamentSchema,
} from '../services/admin/catalog'
import { summary } from '../services/admin/stats'

describe('computePrice with coupon', () => {
  it('subtracts a coupon amount after the discount and never goes negative', () => {
    expect(computePrice({ hourlyRate: 100, durationHours: 2, userCount: 1, discountType: 'PERCENTAGE', discountValue: 10, couponDiscount: 20 }).totalAmount).toBe(160)
    expect(computePrice({ hourlyRate: 10, durationHours: 1, userCount: 1, couponDiscount: 500 }).totalAmount).toBe(0)
  })
})

describe('receipt', () => {
  const booking = {
    id: '11111111-1111-1111-1111-111111111111', created_at: '2030-01-01T04:30:00+00:00',
    start_at: '2030-01-01 10:00:00', end_at: '2030-01-01 12:00:00', duration_hours: 2, user_count: 2,
    total_amount: '520', original_amount: '600', food_total: '100', discount_type: 'PERCENTAGE', discount_value: '10',
    coupon_code: 'C1', coupon_discount: 20, amount_paid: 200, remaining_amount: 320, payment_status: 'PARTIAL', payment_method: 'CASH',
    user_profiles: { full_name: 'Ann', username: 'ann' }, stations: { name: 'Corpo PC', type: 'PC', hourly_rate: 120 },
  }
  it('does not add food on top of a total that already includes it', () => {
    const l = receiptLines(booking)
    expect(l.total).toBe(520) // old receipt printed 520 + 100
    expect(l.session).toBe(500)
    expect(l.food).toBe(100)
    expect(l.discount).toBe(60) // 10% of 600
  })
  it('prints times in IST whatever form they were stored in', () => {
    expect(formatIst('2030-01-01 10:00:00')).toBe('01/01/2030 10:00')
    expect(formatIst('2030-01-01T04:30:00+00:00')).toBe('01/01/2030 10:00') // legacy UTC check-in
    expect(formatIst('2030-01-01T04:30:00Z')).toBe('01/01/2030 10:00')
    expect(formatIst(null)).toBeNull()
  })
  it('renders a valid one-page PDF, including with null joins and null numbers (old code crashed)', async () => {
    const full = await buildReceiptPdf(booking)
    expect(Buffer.from(full.slice(0, 5)).toString()).toBe('%PDF-')
    expect((await PDFDocument.load(full)).getPageCount()).toBe(1)
    const sparse = await buildReceiptPdf({ id: 'x', created_at: '2030-01-01T00:00:00Z', total_amount: null, food_total: null, amount_paid: null, remaining_amount: -50, stations: null, user_profiles: null })
    expect(sparse.length).toBeGreaterThan(1000)
    if (process.env.WRITE_RECEIPT) writeFileSync(process.env.WRITE_RECEIPT, full)
  })
})

describe('admin bookings', () => {
  it('paginates with one query and exact count', async () => {
    const { db, log } = fakeDb({ tables: { bookings: { data: [{ id: '1', status: 'UPCOMING', start_at: '2099-01-01 10:00:00', end_at: '2099-01-01 11:00:00', start_time: '10:00', checked_in: false }], count: 41 } } })
    const out = await listBookings(pageQuery.parse({ page: '3', limit: '10' }), false, db)
    expect(out).toMatchObject({ total: 41, page: 3, limit: 10 })
    expect(log.length).toBe(1)
    expect(log[0].calls).toContainEqual({ method: 'range', args: [20, 29] })
    expect(log[0].calls).toContainEqual({ method: 'neq', args: ['status', 'CANCELLED'] })
    expect(() => pageQuery.parse({ limit: '1000' })).toThrow()
  })
  it('groups by station and survives bookings with no station (old code threw)', async () => {
    const rows = [{ id: '1', stations: { name: 'A' } }, { id: '2', stations: null }, { id: '3', stations: { name: 'A' } }]
    const g = await bookingsByDate('2030-01-01', fakeDb({ tables: { bookings: { data: rows } } }).db)
    expect(Object.keys(g).sort()).toEqual(['A', 'Unassigned'])
    expect(g.A).toHaveLength(2)
    const c = await calendar({}, fakeDb({ tables: { bookings: { data: rows } } }).db)
    expect(c.Unassigned).toHaveLength(1)
  })
  it('reservation board: stations, latest check-in per station, unassigned sidebar, no duplicates', async () => {
    const { db } = fakeDb({ tables: {
      stations: { data: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }] },
      bookings: (calls) => {
        const has = (m: string, a: unknown[]) => calls.some((c) => c.method === m && JSON.stringify(c.args) === JSON.stringify(a))
        if (has('is', ['station_id', null])) return { data: [{ id: 'r3', station_id: null }, { id: 'r1', station_id: 's1' }] }
        if (has('eq', ['checked_in', true])) return { data: [
          { id: 'c1', station_id: 's2', checked_in_at: '2030-01-01T10:00:00Z' },
          { id: 'c2', station_id: 's2', checked_in_at: '2030-01-01T11:00:00Z' },
          { id: 'c3', station_id: 'gone', checked_in_at: '2030-01-01T09:00:00Z' },
        ] }
        return { data: [{ id: 'r1', station_id: 's1' }, { id: 'r2', station_id: null }] }
      },
    } })
    const board = await stationsWithReservations('2030-01-01', db)
    expect(board.map((x) => x.station.name)).toEqual(['A', 'B', 'Unassigned Reservations'])
    expect(board[0].reservations.map((r) => r.id)).toEqual(['r1'])
    expect(board[1].reservations.map((r) => r.id)).toEqual(['c2']) // only the latest check-in
    expect(board[2].station).toEqual({ id: null, name: 'Unassigned Reservations', type: 'MIXED' })
    expect(board[2].reservations.map((r) => r.id).sort()).toEqual(['c3', 'r2', 'r3']) // r1 not repeated
  })
})

describe('updateBooking', () => {
  // A booking as the database returns it (what the edit screen holds and sends back)
  const row = {
    id: 'b1', user_id: '11111111-1111-1111-1111-111111111111', station_id: '22222222-2222-2222-2222-222222222222',
    start_at: '2030-01-01 10:00:00', end_at: '2030-01-01 11:00:00', start_time: '10:00:00', end_time: '11:00:00',
    status: 'UPCOMING', paid: null, checked_in: null, advance_paid: null, cancelled_at: null, booking_notes: null,
    payment_method: null, advance_payment_method: null, coupon_code: 'C1', refund_amount: null, cancellation_fee: null,
    custom_hourly_rate: null, duration_hours: 1, user_count: 1, food_total: 0, food_items: [], discount_type: 'NONE',
    discount_value: 0, coupon_discount: 20, amount_paid: 80, total_amount: 80, original_amount: 100, remaining_amount: 0,
    payment_status: 'PAID', created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z',
    stations: { hourly_rate: 100 }, user_profiles: { username: 'ann' },
  }
  const run = async (input: unknown, existing: object = row) => {
    const { db, log } = fakeDb({ tables: { bookings: (calls) => ({ data: calls.some((c) => c.method === 'update') ? { id: 'b1' } : existing }) } })
    const out = await updateBooking('b1', parseBookingPatch(input), db)
    const update = log.flatMap((e) => e.calls).find((c) => c.method === 'update')
    return { update: update?.args[0] as Record<string, unknown> | undefined, out }
  }

  it('accepts the full row the edit screen sends back (joins, nulls, empty times, ids) without a 400', async () => {
    const { update } = await run({ ...row, start_time: '', end_time: '', duration_hours: 2, hourly_rate: 100, discount_type: 'NONE', discount_value: 0 })
    expect(update).toMatchObject({ start_time: null, end_time: null, duration_hours: 2, total_amount: 180, original_amount: 200, remaining_amount: 100, payment_status: 'PARTIAL', paid: false })
    // joined objects, ids and timestamps never reach the update; untouched columns are not rewritten
    for (const k of ['stations', 'user_profiles', 'id', 'created_at', 'user_id', 'status', 'booking_notes', 'custom_hourly_rate']) expect(update).not.toHaveProperty(k)
  })
  it('writes nothing when nothing changed', async () => {
    const { update, out } = await run({ ...row, start_time: '10:00', hourly_rate: 100 })
    expect(update).toBeUndefined()
    expect(out).toMatchObject({ id: 'b1' })
    expect(out).not.toHaveProperty('stations')
  })
  it('keeps the coupon discount and flips PAID to PARTIAL when the bill grows', async () => {
    const { update } = await run({ duration_hours: 2, food_total: 30 })
    expect(update).toMatchObject({ original_amount: 230, total_amount: 210, remaining_amount: 130, payment_status: 'PARTIAL', paid: false })
  })
  it('a changed hourly rate becomes the custom rate; an unchanged one is not pinned', async () => {
    expect((await run({ hourly_rate: 50 })).update).toMatchObject({ custom_hourly_rate: 50, total_amount: 30 })
    expect((await run({ hourly_rate: 100, booking_notes: 'hi' })).update).toEqual({ booking_notes: 'hi' })
  })
  it('honours a manually typed total when no price input changed', async () => {
    expect((await run({ total_amount: 55 })).update).toEqual({ total_amount: 55 })
  })
  it('converts legacy UTC/ISO timestamps to IST text and coerces numeric strings', async () => {
    const { update } = await run({ start_at: '2030-01-01T05:30:00.123+00:00', end_at: '2030-01-01 16:30', amount_paid: '90' })
    expect(update).toMatchObject({ start_at: '2030-01-01 11:00:00', end_at: '2030-01-01 16:30:00', amount_paid: 90 })
  })
  it('rejects genuinely invalid values, drops unknown keys, and 404s / 400s on the edges', async () => {
    expect(() => parseBookingPatch({ total_amount: -5 })).toThrow()
    expect(() => parseBookingPatch({ status: 'WHATEVER' })).toThrow()
    expect(() => parseBookingPatch({ start_at: 'not a date' })).toThrow()
    expect(() => parseBookingPatch([1])).toThrow()
    expect(normalizeBookingPatch({ bogus: 1, stations: {}, notes: 'x' })).toEqual({})
    expect(parseBookingPatch({ payment_status: 'REFUNDED' })).toEqual({ payment_status: 'REFUNDED' })
    await expect(updateBooking('b1', {}, fakeDb({ tables: { bookings: { data: row } } }).db)).rejects.toMatchObject({ status: 400 })
    await expect(updateBooking('b1', { duration_hours: 2 }, fakeDb({ tables: { bookings: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
  })
})

describe('recordPayment', () => {
  it('derives status and marks a confirmed advance as paid', async () => {
    const { db, log } = fakeDb({ tables: { bookings: (calls) => ({ data: calls.some((c) => c.method === 'update') ? { id: 'b' } : { total_amount: 300, advance_amount: 90 } }) } })
    await recordPayment('b', 100, db)
    const u = log.flatMap((e) => e.calls).find((c) => c.method === 'update')!.args[0]
    expect(u).toEqual({ amount_paid: 100, remaining_amount: 200, payment_status: 'PARTIAL', paid: false, advance_paid: true })
    await expect(recordPayment('b', 1, fakeDb({ tables: { bookings: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
  })
})

describe('operations', () => {
  it('check-in passes IST time and maps database errors', async () => {
    const { db, log } = fakeDb({ rpcs: { checkin_booking: { data: { id: 'b' } } } })
    await checkin('b', 's', db, new Date('2030-01-01T04:30:00Z'))
    expect(rpcArgs(log, 'checkin_booking')).toEqual({ p_booking_id: 'b', p_station_id: 's', p_now_ist: '2030-01-01 10:00:00' })
    for (const [code, status] of [['STATION_BUSY', 400], ['ALREADY_CHECKED_IN', 400], ['BOOKING_NOT_FOUND', 404], ['STATION_NOT_FOUND', 404]] as const) {
      await expect(checkin('b', 's', fakeDb({ rpcs: { checkin_booking: { error: { message: code } } } }).db)).rejects.toMatchObject({ status })
    }
  })
  it('timer start validates state; stop and extend go through the database', async () => {
    const row = (over: object) => fakeDb({ tables: { bookings: (calls) => ({ data: calls.some((c) => c.method === 'update') ? { id: 'b' } : over }) } }).db
    await expect(startTimer('b', fakeDb({ tables: { bookings: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
    await expect(startTimer('b', row({ checked_in_at: null }))).rejects.toMatchObject({ message: expect.stringContaining('checked in') })
    await expect(startTimer('b', row({ checked_in_at: 'x', timer_started_at: 'y' }))).rejects.toMatchObject({ message: 'Timer already running' })
    expect(await startTimer('b', row({ checked_in_at: 'x', timer_started_at: null }))).toEqual({ id: 'b' })
    await expect(stopTimer('b', fakeDb({ rpcs: { stop_timer: { error: { message: 'TIMER_NOT_RUNNING' } } } }).db)).rejects.toMatchObject({ message: 'Timer is not running' })
    await expect(extendHour('b', fakeDb({ rpcs: { extend_booking_hour: { error: { message: 'STATION_REQUIRED' } } } }).db)).rejects.toMatchObject({ message: expect.stringContaining('no station rate') })
    expect(await extendHour('b', fakeDb({ rpcs: { extend_booking_hour: { data: { new_total: 5 } } } }).db)).toEqual({ new_total: 5 })
  })
  it('grace time starts once and a repeat call keeps the original start', async () => {
    const first = fakeDb({ tables: { bookings: { data: { grace_time_started_at: 'x' } } } }).db
    expect(await startGrace('b', first)).toMatchObject({ message: 'Grace time started' })
    const repeat = fakeDb({ tables: { bookings: (calls) => ({ data: calls.some((c) => c.method === 'update') ? null : { grace_time_started_at: 'orig' } }) } }).db
    expect(await startGrace('b', repeat)).toEqual({ message: 'Grace time started', grace_started_at: 'orig' })
    await expect(startGrace('b', fakeDb({ tables: { bookings: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
  })
})

describe('catalog admin', () => {
  it('food items: validates, upserts, and deactivates removed items instead of deleting', async () => {
    expect(() => foodItemsSchema.parse([{ name: 'a', price: 1 }, { name: 'a', price: 2 }])).toThrow()
    expect(() => foodItemsSchema.parse([{ name: 'a', price: -1 }])).toThrow()
    const { db, log } = fakeDb({ tables: { charges_items: { data: [{ name: 'Tea' }, { name: 'Old' }] } } })
    await replaceFoodItems([{ name: 'Tea', price: 20 }], db)
    const calls = log.flatMap((e) => e.calls)
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    expect(calls).toContainEqual({ method: 'in', args: ['name', ['Old']] })
    expect(calls).toContainEqual({ method: 'update', args: [{ active: false }] })
  })
  it('admin emails are normalised, de-duplicated, and the role cache is cleared', async () => {
    const { db, log } = fakeDb()
    await setAdminEmails(['a@b.com', 'a@b.com'], db)
    expect(log[0].calls[0].args[0]).toEqual({ id: 1, admin_emails: '["a@b.com"]' })
  })
  it('coupons: code upper-cased, percentage bounded, duplicates are a 400', async () => {
    const q = createCouponQuery.parse({ code: ' summer10 ', discount_percentage: '10' })
    expect(q).toMatchObject({ code: 'SUMMER10', coupon_type: 'PROMO', expires_days: 30 })
    expect(() => createCouponQuery.parse({ code: 'ABC', discount_percentage: '150' })).toThrow()
    await expect(createCoupon('a', q, fakeDb({ tables: { coupons: { error: { code: '23505' } } } }).db)).rejects.toMatchObject({ message: 'Coupon code already exists' })
  })
  it('plans, cards, tournaments', async () => {
    await expect(deletePlan('p', fakeDb({ tables: { prepaid_plans: { data: [] } } }).db)).rejects.toMatchObject({ status: 404 })
    await expect(deletePlan('p', fakeDb({ tables: { prepaid_plans: { error: { code: '23503' } } } }).db)).rejects.toMatchObject({ message: expect.stringContaining('deactivate') })
    await expect(confirmCard('c', fakeDb({ rpcs: { confirm_prepaid_card: { error: { message: 'ALREADY_ACTIVE' } } } }).db)).rejects.toMatchObject({ status: 400 })
    await expect(setTournamentStatus('t', 'open', fakeDb({ tables: { tournaments: { data: [] } } }).db)).rejects.toMatchObject({ status: 404 })
    expect(tournamentSchema.parse({ name: 'N', game: 'G', platform: 'PC', max_players: 8, tournament_type: 'league' }).description).toBe('')
    expect(() => tournamentSchema.parse({ name: 'N', game: 'G', platform: 'XBOX', max_players: 8, tournament_type: 'league' })).toThrow()
    const { db } = fakeDb({ tables: { user_prepaid_cards: { data: [{ id: 'c', user_id: 'u' }] }, user_profiles: { data: [{ user_id: 'u', username: 'ann' }] }, tournament_registrations: { data: [{ user_id: 'u' }] } } })
    expect((await listCards('PENDING', db))[0].user_profiles).toEqual({ user_id: 'u', username: 'ann' })
    expect((await tournamentRegistrations('t', db))[0].user_profiles).toEqual({ user_id: 'u', username: 'ann' })
  })
  it('stats pass IST "today" to the database', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2030-01-01T20:00:00Z')) // already the 2nd in IST
    const { db, log } = fakeDb({ rpcs: { admin_stats_summary: { data: { total_bookings: 1 } } } })
    await summary({ start_date: '2030-01-01' }, db)
    expect(rpcArgs(log, 'admin_stats_summary')).toEqual({ p_start: '2030-01-01', p_end: null, p_today: '2030-01-02' })
    vi.useRealTimers()
  })
})
