import { describe, expect, it, vi } from 'vitest'
import { fakeDb } from './fakeDb'

vi.mock('../services/bookingNotifications', () => ({ notifyBookingCreated: vi.fn(async () => null) }))
vi.mock('../mailer', () => ({ sendBookingConfirmation: vi.fn(async () => ({ sent: true })), sendReminderEmail: vi.fn() }))

import { notifyBookingCreated } from '../services/bookingNotifications'
import { createBooking, createBookingSchema } from '../services/bookings'

const spy = vi.mocked(notifyBookingCreated)
const user = { id: 'u1', email: 'a@b.com', role: 'user' as const }

describe('createBooking and WhatsApp', () => {
  const make = (input: object, row: object) =>
    createBooking(
      user,
      createBookingSchema.parse({ duration_hours: 2, user_count: 1, ...input }),
      fakeDb({
        tables: { stations: { data: { name: 'Omega s3', type: 'PS5' } }, charges_items: { data: [] } },
        rpcs: { create_booking: { data: { id: 'b1', station_id: 's1', total_amount: 150, ...row } } },
      }).db,
    )

  it('tells the customer about a booking with a time, using the saved station', async () => {
    spy.mockClear()
    await make({ station_id: '00000000-0000-4000-8000-000000000001', start_at: '2026-10-31 16:00:00', end_at: '2026-10-31 18:00:00', start_time: '16:00', end_time: '18:00' }, {})
    expect(spy).toHaveBeenCalledTimes(1)
    const [, userId, booking, facts] = spy.mock.calls[0]
    expect(userId).toBe('u1')
    expect(booking).toMatchObject({ id: 'b1' })
    expect(facts).toMatchObject({ start_at: '2026-10-31 16:00:00', start_time: '16:00', duration_hours: 2, station_name: 'Omega s3', station_type: 'PS5' })
  })
  it('treats a booking with no time as a reservation', async () => {
    spy.mockClear()
    await make({ station_type: 'PS5', start_at: '2026-10-31 00:00:00', end_at: '2026-10-31 23:59:59' }, { station_id: null })
    expect(spy.mock.calls[0][3]).toMatchObject({ start_time: null, station_name: null, station_type: 'PS5' })
  })
})
