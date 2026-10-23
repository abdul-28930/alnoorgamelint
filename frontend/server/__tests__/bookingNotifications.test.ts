import { describe, expect, it, vi } from 'vitest'
import { fakeDb, type Call } from './fakeDb'
import { bookingReference, formatAmount, formatClock, formatDay } from '../whatsapp/format'
import { notifyBookingCreated } from '../services/bookingNotifications'

const cfg = { licenseNumber: 'L1', apiKey: 'K1', baseUrl: 'https://wa.test/api' }
const has = (c: Call[], m: string) => c.some((x) => x.method === m)
const urls = (f: unknown) => (f as { mock: { calls: [URL][] } }).mock.calls.map((c) => c[0])
const okFetch = () => vi.fn(async () => new Response('{"status":"success"}')) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const BOOKING = { id: 'a1b2c3d4-0000-4000-8000-000000000001', total_amount: 150 }

const world = (tpl = 'booking_confirmed', profile: object | null = { full_name: 'Rahul', username: 'rahul', phone: '98765 43210' }) =>
  fakeDb({
    tables: {
      user_profiles: { data: profile },
      whatsapp_templates: { data: { template_name: tpl, enabled: true } },
      notification_log: (c: Call[]) => (has(c, 'insert') && has(c, 'select') ? { data: { id: 'n1', attempts: 0 } } : {}),
    },
  })

describe('formatting', () => {
  it('writes things the way customers read them', () => {
    expect(bookingReference('a1b2c3d4-0000-4000-8000-000000000001')).toBe('NGCA1B2C3')
    expect(formatDay('2026-10-31')).toBe('31 Oct 2026')
    expect(formatDay('2026-11-01 10:00:00')).toBe('1 Nov 2026')
    expect(formatClock('16:00')).toBe('4:00 PM')
    expect(formatClock('00:30:00')).toBe('12:30 AM')
    expect(formatClock('12:05')).toBe('12:05 PM')
    expect(formatAmount(150)).toBe('150')
    expect(formatAmount('150.5')).toBe('150.50')
    expect(formatAmount(undefined)).toBe('0')
  })
})

describe('notifyBookingCreated', () => {
  it('confirms a booking with a time', async () => {
    const f = okFetch()
    const w = world()
    const out = await notifyBookingCreated(w.db, 'u1', BOOKING, { start_at: '2026-10-31 16:00:00', start_time: '16:00', duration_hours: 2, station_name: 'Afterlife PS5 Omega s3', station_type: 'PS5' }, { cfg, fetchImpl: f })
    expect(out?.status).toBe('sent')
    const u = urls(f)[0]
    expect(u.searchParams.get('Contact')).toBe('919876543210')
    expect(u.searchParams.get('Param')).toBe('Rahul,Afterlife PS5 Omega s3,31 Oct 2026,4:00 PM,2,150,NGCA1B2C3')
    const row = w.log.find((e) => e.table === 'notification_log' && has(e.calls, 'insert'))!.calls.find((c) => c.method === 'insert')!.args[0]
    expect(row).toMatchObject({ event: 'booking_confirmed', dedupe_key: `booking:${BOOKING.id}:created`, booking_id: BOOKING.id })
  })
  it('acknowledges a reservation (no time yet) with the other message', async () => {
    const f = okFetch()
    await notifyBookingCreated(world('reservation_received').db, 'u1', BOOKING, { start_at: '2026-10-31 00:00:00', start_time: null, duration_hours: 1, station_name: null, station_type: 'PS5' }, { cfg, fetchImpl: f })
    expect(urls(f)[0].searchParams.get('Param')).toBe('Rahul,PS5,31 Oct 2026,150,NGCA1B2C3')
    expect(urls(f)[0].searchParams.get('Template')).toBe('reservation_received')
  })
  it('says the station will be assigned when none is chosen yet', async () => {
    const f = okFetch()
    await notifyBookingCreated(world().db, 'u1', BOOKING, { start_at: '2026-10-31 16:00:00', start_time: '16:00', duration_hours: 1, station_name: null, station_type: 'PS5' }, { cfg, fetchImpl: f })
    expect(urls(f)[0].searchParams.get('Param')).toContain('PS5 (we will assign your station)')
  })
  it('sends nothing when WhatsApp is not configured, and nothing twice for one booking', async () => {
    const f = okFetch()
    const facts = { start_at: '2026-10-31 16:00:00', start_time: '16:00', duration_hours: 1, station_name: 'A', station_type: 'PS5' }
    expect(await notifyBookingCreated(world().db, 'u1', BOOKING, facts, { cfg: null, fetchImpl: f })).toBeNull()
    expect(f).not.toHaveBeenCalled()
    const dup = fakeDb({ tables: { user_profiles: { data: { full_name: 'R', phone: '9876543210' } }, whatsapp_templates: { data: { template_name: 't', enabled: true } }, notification_log: { data: null, error: { code: '23505' } } } })
    expect((await notifyBookingCreated(dup.db, 'u1', BOOKING, facts, { cfg, fetchImpl: f }))?.status).toBe('duplicate')
    expect(f).not.toHaveBeenCalled()
  })
  it('skips, quietly logged, when the customer has no number', async () => {
    const f = okFetch()
    const out = await notifyBookingCreated(world('booking_confirmed', { full_name: 'R', phone: null }).db, 'u1', BOOKING, { start_at: '2026-10-31 16:00:00', start_time: '16:00', duration_hours: 1, station_name: 'A', station_type: 'PS5' }, { cfg, fetchImpl: f })
    expect(out).toMatchObject({ status: 'skipped', detail: 'No valid mobile number' })
    expect(f).not.toHaveBeenCalled()
  })
  it('never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = { from: () => { throw new Error('db down') } } as never
    await expect(notifyBookingCreated(broken, 'u1', BOOKING, { start_at: '2026-10-31 16:00:00', start_time: '16:00', duration_hours: 1, station_name: null, station_type: null }, { cfg })).resolves.toBeNull()
  })
})
