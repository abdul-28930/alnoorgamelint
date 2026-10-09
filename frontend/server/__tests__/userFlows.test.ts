import { describe, expect, it, vi } from 'vitest'

vi.mock('../mailer', async (orig) => ({ ...(await orig<typeof import('../mailer')>()), sendBookingConfirmation: vi.fn().mockResolvedValue({ sent: true }) }))

import { fakeDb, rpcArgs } from './fakeDb'
import { sendBookingConfirmation } from '../mailer'
import { effectiveStatus } from '../status'
import {
  cancelBooking, createBooking, createBookingSchema, listUserBookings, mapRpcError, priceFood, resolveTimes,
} from '../services/bookings'
import { createFirstBookingCoupon, listMyCoupons, useReferral, validateCoupon } from '../services/coupons'
import { getPoints, redeemReward } from '../services/points'
import { getBalance, purchasePlan } from '../services/prepaid'

const user = { id: 'u1', email: 'u@x.com', role: 'user' as const }

describe('effectiveStatus', () => {
  const base = { status: 'UPCOMING', start_at: '2030-01-01 10:00:00', end_at: '2030-01-01 12:00:00', start_time: '10:00', checked_in: false }
  it('derives upcoming / ongoing / ended from the clock', () => {
    expect(effectiveStatus(base, '2030-01-01 09:00:00')).toBe('UPCOMING')
    expect(effectiveStatus(base, '2030-01-01 11:00:00')).toBe('ONGOING')
    expect(effectiveStatus(base, '2030-01-01 12:00:00')).toBe('ENDED')
  })
  it('keeps a checked-in session ONGOING past its end, and treats NULL checked_in as not checked in', () => {
    expect(effectiveStatus({ ...base, status: 'ONGOING', checked_in: true }, '2030-01-01 13:00:00')).toBe('ONGOING')
    expect(effectiveStatus({ ...base, status: 'ONGOING', checked_in: null }, '2030-01-01 13:00:00')).toBe('ENDED')
  })
  it('never touches reservations or cancelled bookings', () => {
    const res = { ...base, status: 'PENDING', start_time: null }
    expect(effectiveStatus(res, '2031-01-01 00:00:00')).toBe('PENDING')
    expect(effectiveStatus({ ...base, status: 'CANCELLED' }, '2031-01-01 00:00:00')).toBe('CANCELLED')
  })
})

describe('createBookingSchema / resolveTimes', () => {
  const ok = { station_type: 'PC', duration_hours: 2 }
  it('validates ranges and types', () => {
    expect(createBookingSchema.parse(ok).user_count).toBe(1)
    expect(() => createBookingSchema.parse({ ...ok, duration_hours: 0 })).toThrow()
    expect(() => createBookingSchema.parse({ ...ok, duration_hours: 1.5 })).toThrow()
    expect(() => createBookingSchema.parse({ ...ok, user_count: -1 })).toThrow()
    expect(() => createBookingSchema.parse({ ...ok, station_type: 'XBOX' })).toThrow()
    expect(() => createBookingSchema.parse({ ...ok, station_id: 'nope' })).toThrow()
  })
  it('keeps explicit times and null start_time (reservation)', () => {
    const t = resolveTimes(createBookingSchema.parse({ ...ok, start_at: '2030-01-01 00:00:00', end_at: '2030-01-01 23:59:59', start_time: null }))
    expect(t).toEqual({ start_at: '2030-01-01 00:00:00', end_at: '2030-01-01 23:59:59', start_time: null, end_time: null })
  })
  it('defaults to 10:00 on the given date, or today in IST', () => {
    expect(resolveTimes(createBookingSchema.parse({ ...ok, start_at: '2030-02-03 00:00:00' }))).toEqual({
      start_at: '2030-02-03 10:00:00', end_at: '2030-02-03 12:00:00', start_time: '10:00', end_time: '12:00',
    })
    const t = resolveTimes(createBookingSchema.parse(ok), new Date('2030-01-01T20:00:00Z')) // 01:30 on the 2nd in IST
    expect(t.start_at).toBe('2030-01-02 10:00:00')
  })
})

describe('priceFood', () => {
  it('sums database prices, ignoring client totals, and rejects unknown names', async () => {
    const { db } = fakeDb({ tables: { charges_items: { data: [{ name: 'Tea', price: 20 }, { name: 'Chips', price: 35.5 }] } } })
    expect(await priceFood(['Tea', 'Tea', 'Chips'], db)).toBe(75.5)
    await expect(priceFood(['Pizza'], db)).rejects.toMatchObject({ status: 400, message: 'Unknown food item: Pizza' })
    expect(await priceFood([], db)).toBe(0)
  })
})

describe('mapRpcError', () => {
  it('maps database codes to the messages the frontend shows', () => {
    expect(mapRpcError({ message: 'SLOT_TAKEN' }, 'x')).toMatchObject({ status: 400, message: 'No stations available at selected time slot' })
    expect(mapRpcError({ message: 'INVALID_COUPON' }, 'x')).toMatchObject({ status: 400, message: 'Invalid or expired coupon' })
    expect(mapRpcError({ message: 'BOOKING_NOT_FOUND' }, 'x')).toMatchObject({ status: 404 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(mapRpcError({ message: 'connection reset' }, 'Failed to create booking')).toMatchObject({ status: 500, message: 'Failed to create booking' })
  })
})

describe('createBooking', () => {
  const row = { id: 'b1', station_id: 's1', total_amount: 240 }
  it('prices food server-side, passes it to the RPC, and emails the user', async () => {
    const { db, log } = fakeDb({
      tables: { charges_items: { data: [{ name: 'Tea', price: 20 }] }, stations: { data: { name: 'Corpo PC' } } },
      rpcs: { create_booking: { data: row } },
    })
    const input = createBookingSchema.parse({
      station_type: 'PC', duration_hours: 2, user_count: 2, food_items: ['Tea'], food_total: 9999, coupon_code: 'C1',
      start_at: '2030-01-01 10:00:00', end_at: '2030-01-01 12:00:00', start_time: '10:00', end_time: '12:00',
    })
    expect(await createBooking(user, input, db)).toEqual(row)
    expect(rpcArgs(log, 'create_booking')).toMatchObject({
      p_user_id: 'u1', p_station_type: 'PC', p_food_total: 20, p_coupon_code: 'C1', p_user_count: 2, p_start_time: '10:00',
    })
    expect(sendBookingConfirmation).toHaveBeenCalledWith('u@x.com', expect.objectContaining({ station_name: 'Corpo PC', total_amount: 240 }))
  })
  it('surfaces database business errors', async () => {
    const { db } = fakeDb({ rpcs: { create_booking: { error: { message: 'SLOT_TAKEN' } } } })
    await expect(createBooking(user, createBookingSchema.parse({ station_type: 'PC', duration_hours: 1 }), db)).rejects.toMatchObject({ status: 400 })
  })
})

describe('listUserBookings / cancelBooking', () => {
  it('returns live statuses without writing', async () => {
    const { db, log } = fakeDb({ tables: { bookings: { data: [
      { id: '1', status: 'UPCOMING', start_at: '2030-01-01 10:00:00', end_at: '2030-01-01 12:00:00', start_time: '10:00', checked_in: false },
    ] } } })
    const out = await listUserBookings('u1', db, new Date('2030-01-01T05:30:00Z')) // 11:00 IST
    expect(out[0].status).toBe('ONGOING')
    expect(log[0].calls.map((c) => c.method)).not.toContain('update')
  })
  it('cancels through the RPC and maps its errors', async () => {
    const ok = fakeDb({ rpcs: { cancel_booking: { data: { refund_amount: 190, cancellation_fee: 10 } } } })
    expect(await cancelBooking('b1', 'u1', ok.db)).toEqual({ message: 'Booking cancelled successfully', refund_amount: 190, cancellation_fee: 10 })
    const bad = fakeDb({ rpcs: { cancel_booking: { error: { message: 'NOT_CANCELLABLE' } } } })
    await expect(cancelBooking('b1', 'u1', bad.db)).rejects.toMatchObject({ status: 400 })
  })
})

describe('coupons', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()
  it('validates ownership and expiry', async () => {
    const ok = fakeDb({ tables: { coupons: { data: { discount_percentage: 10, created_for: null, expires_at: future } } } })
    expect(await validateCoupon(user, 'X', ok.db)).toEqual({ discount_percentage: 10, valid: true })
    await expect(validateCoupon(user, 'X', fakeDb({ tables: { coupons: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
    await expect(validateCoupon(user, 'X', fakeDb({ tables: { coupons: { data: { discount_percentage: 5, created_for: null, expires_at: past } } } }).db)).rejects.toMatchObject({ status: 404 })
    await expect(validateCoupon(user, 'X', fakeDb({ tables: { coupons: { data: { discount_percentage: 5, created_for: 'other', expires_at: future } } } }).db)).rejects.toMatchObject({ status: 403 })
  })
  it('only mints a first-booking coupon for new customers without one', async () => {
    const has = fakeDb({ tables: { coupons: { data: [{ id: 'c' }] }, bookings: { count: 0 } } })
    expect(await createFirstBookingCoupon(user, has.db)).toEqual({ message: 'First booking coupon already exists' })
    const old = fakeDb({ tables: { coupons: { data: [] }, bookings: { count: 3 } } })
    await expect(createFirstBookingCoupon(user, old.db)).rejects.toMatchObject({ status: 400 })
    const fresh = fakeDb({ tables: { coupons: { data: [] }, bookings: { count: 0 } } })
    expect(await createFirstBookingCoupon(user, fresh.db)).toMatchObject({ code: 'FIRSTU1' })
  })
  it('lists my coupons', async () => {
    expect(await listMyCoupons('u1', fakeDb({ tables: { coupons: { data: [{ id: 1 }] } } }).db)).toEqual([{ id: 1 }])
  })
})

describe('useReferral', () => {
  const tables = (over: Record<string, unknown> = {}) => ({
    user_profiles: (calls: { method: string }[]) =>
      calls.some((c) => c.method === 'update')
        ? { data: over.claimed ?? [{ user_id: 'u1' }] }
        : { data: over.referrer === undefined ? { user_id: 'ref' } : over.referrer },
    bookings: { count: (over.bookings as number | undefined) ?? 0 },
  })
  it('creates coupons for both users', async () => {
    const { db, log } = fakeDb({ tables: tables(), rpcs: { create_referral_coupons: { data: true } } })
    expect(await useReferral(user, 'REFabc', db)).toEqual({ message: 'Referral coupons created for both users' })
    expect(rpcArgs(log, 'create_referral_coupons')).toEqual({ referrer_id: 'ref', referee_id: 'u1' })
  })
  it('rejects unknown codes, own code, existing customers and repeat use', async () => {
    await expect(useReferral(user, 'x', fakeDb({ tables: tables({ referrer: null }) }).db)).rejects.toMatchObject({ status: 404 })
    await expect(useReferral(user, 'x', fakeDb({ tables: tables({ referrer: { user_id: 'u1' } }) }).db)).rejects.toMatchObject({ message: 'Cannot use your own referral code' })
    await expect(useReferral(user, 'x', fakeDb({ tables: tables({ bookings: 2 }) }).db)).rejects.toMatchObject({ message: 'Referral codes are only for new users' })
    const { db, log } = fakeDb({ tables: tables({ claimed: [] }), rpcs: { create_referral_coupons: { data: true } } })
    await expect(useReferral(user, 'x', db)).rejects.toMatchObject({ message: 'You have already used a referral code' })
    expect(rpcArgs(log, 'create_referral_coupons')).toBeUndefined()
  })
  it('releases the claim when coupon creation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, log } = fakeDb({ tables: tables(), rpcs: { create_referral_coupons: { error: { message: 'boom' } } } })
    await expect(useReferral(user, 'x', db)).rejects.toMatchObject({ status: 500 })
    const updates = log.filter((e) => e.table === 'user_profiles' && e.calls.some((c) => c.method === 'update'))
    expect(updates.length).toBe(2) // claim, then release
  })
})

describe('points, prepaid', () => {
  it('reads balances', async () => {
    expect(await getPoints('u1', fakeDb({ tables: { user_profiles: { data: { points_balance: 120 } } } }).db)).toEqual({ points_balance: 120 })
    expect(await getPoints('u1', fakeDb({ tables: { user_profiles: { data: null } } }).db)).toEqual({ points_balance: 0 })
  })
  it('redeem returns the real reason on failure', async () => {
    const bad = fakeDb({ rpcs: { redeem_points_for_reward: { data: { success: false, error: 'Insufficient points' } } } })
    await expect(redeemReward('u1', 'r1', bad.db)).rejects.toMatchObject({ status: 400, message: 'Insufficient points' })
    const ok = fakeDb({ rpcs: { redeem_points_for_reward: { data: { success: true, coupon_code: 'POINTSX', points_deducted: 500 } } } })
    expect(await redeemReward('u1', 'r1', ok.db)).toEqual({ message: 'Reward redeemed successfully!', coupon_code: 'POINTSX', points_deducted: 500 })
  })
  it('prepaid: balance counts ACTIVE cards only; purchase is PENDING', async () => {
    const bal = fakeDb({ tables: { user_prepaid_cards: { data: [{ remaining_minutes: 30 }, { remaining_minutes: 45 }] } } })
    expect(await getBalance('u1', bal.db)).toEqual({ remaining_minutes: 75 })
    expect(bal.log[0].calls).toContainEqual({ method: 'eq', args: ['status', 'ACTIVE'] })

    const { db, log } = fakeDb({ tables: { prepaid_plans: { data: { id: 'p1', minutes: 120 } }, user_prepaid_cards: { data: { id: 'c1', status: 'PENDING' } } } })
    expect(await purchasePlan('u1', 'p1', db)).toEqual({ id: 'c1', status: 'PENDING' })
    const insert = log.find((e) => e.table === 'user_prepaid_cards')!.calls.find((c) => c.method === 'insert')!
    expect(insert.args[0]).toMatchObject({ user_id: 'u1', plan_id: 'p1', total_minutes: 120, remaining_minutes: 120, status: 'PENDING' })
    await expect(purchasePlan('u1', 'p1', fakeDb({ tables: { prepaid_plans: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
  })
})
