import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { AuthUser } from '../auth'
import { ApiError, badRequest, notFound } from '../http'
import { sendBookingConfirmation } from '../mailer'
import { effectiveStatus } from '../status'
import { getSupabase } from '../supabase'
import { addHoursIst, istDate, toIstString } from '../time'

const istDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/, 'expected YYYY-MM-DD HH:MM:SS')
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'expected HH:MM')

export const createBookingSchema = z.object({
  station_id: z.string().uuid().nullish(),
  station_type: z.enum(['PC', 'PS5']).nullish(),
  start_at: istDateTime.nullish(),
  end_at: istDateTime.nullish(),
  start_time: hhmm.nullish(),
  end_time: hhmm.nullish(),
  duration_hours: z.number().int().min(1).max(24),
  user_count: z.number().int().min(1).max(20).default(1),
  advance_payment: z.boolean().default(false),
  // Names of items from the price list. Prices come from the database; any client-sent total is ignored.
  food_items: z.array(z.string().trim().min(1)).max(50).default([]),
  food_total: z.number().optional(),
  coupon_code: z.string().trim().max(50).nullish(),
})
export type CreateBookingInput = z.infer<typeof createBookingSchema>

/** RPC exceptions carry short codes; map them to the messages and statuses the frontend expects. */
const RPC_ERRORS: Record<string, [number, string]> = {
  SLOT_TAKEN: [400, 'No stations available at selected time slot'],
  STATION_NOT_FOUND: [404, 'Station not found or inactive'],
  NO_STATIONS_OF_TYPE: [404, 'No stations available'],
  STATION_REQUIRED: [400, 'Either station_id or station_type must be provided'],
  INVALID_COUPON: [400, 'Invalid or expired coupon'],
  INVALID_DURATION: [400, 'duration_hours must be between 1 and 24'],
  INVALID_USER_COUNT: [400, 'user_count must be at least 1'],
  INVALID_FOOD_TOTAL: [400, 'Invalid food total'],
  BOOKING_NOT_FOUND: [404, 'Booking not found'],
  NOT_CANCELLABLE: [400, 'Only upcoming bookings can be cancelled'],
  ALREADY_CHECKED_IN: [400, 'Booking already checked in'],
  STATION_BUSY: [400, 'Station already has an active booking'],
  NOT_CHECKABLE: [400, 'Cancelled bookings cannot be checked in'],
  TIMER_NOT_RUNNING: [400, 'Timer is not running'],
  NOT_EXTENDABLE: [400, 'Only active bookings can be extended'],
  ALREADY_ACTIVE: [400, 'Card is already active'],
  CARD_NOT_FOUND: [404, 'Prepaid card not found'],
}

export function mapRpcError(
  error: { message?: string } | null | undefined,
  fallback: string,
  overrides: Record<string, [number, string]> = {},
): ApiError {
  const table = { ...RPC_ERRORS, ...overrides }
  const code = Object.keys(table).find((c) => error?.message?.includes(c))
  if (code) return new ApiError(...table[code])
  console.error(`${fallback}:`, error)
  return new ApiError(500, fallback)
}

/** Resolves food names against the price list. Unknown names are rejected rather than priced at 0. */
export async function priceFood(names: string[], db: SupabaseClient): Promise<number> {
  if (names.length === 0) return 0
  const { data, error } = await db.from('charges_items').select('name, price').eq('active', true).in('name', Array.from(new Set(names)))
  if (error) throw new ApiError(500, 'Failed to load food items')
  const prices = new Map((data ?? []).map((r) => [r.name as string, Number(r.price)]))
  let total = 0
  for (const n of names) {
    const p = prices.get(n)
    if (p === undefined) throw badRequest(`Unknown food item: ${n}`)
    total += p
  }
  return Math.round(total * 100) / 100
}

/** Same defaults as before: no times given -> 10:00 on the requested (or today's) date. */
export function resolveTimes(input: CreateBookingInput, now: Date = new Date()) {
  if (input.start_at && input.end_at) {
    return {
      start_at: input.start_at.replace('T', ' ').padEnd(19, ':00').slice(0, 19),
      end_at: input.end_at.replace('T', ' ').padEnd(19, ':00').slice(0, 19),
      start_time: input.start_time ? input.start_time.slice(0, 5) : null, // null = reservation
      end_time: input.end_time ? input.end_time.slice(0, 5) : null,
    }
  }
  const date = input.start_at ? input.start_at.slice(0, 10) : istDate(now)
  const start_at = `${date} 10:00:00`
  const end_at = addHoursIst(start_at, input.duration_hours)
  return { start_at, end_at, start_time: '10:00', end_time: end_at.slice(11, 16) }
}

export async function createBooking(user: AuthUser, input: CreateBookingInput, db: SupabaseClient = getSupabase()) {
  const times = resolveTimes(input)
  const foodTotal = await priceFood(input.food_items, db)

  const { data, error } = await db.rpc('create_booking', {
    p_user_id: user.id,
    p_station_id: input.station_id ?? null,
    p_station_type: input.station_type ?? null,
    p_start_at: times.start_at,
    p_end_at: times.end_at,
    p_start_time: times.start_time,
    p_end_time: times.end_time,
    p_duration_hours: input.duration_hours,
    p_user_count: input.user_count,
    p_advance: input.advance_payment,
    p_food_items: input.food_items,
    p_food_total: foodTotal,
    p_coupon_code: input.coupon_code || null,
  })
  if (error || !data) throw mapRpcError(error, 'Failed to create booking')
  const booking = data as Record<string, unknown> & { id: string; station_id: string | null }

  // Best effort: a mail problem must never fail a booking that is already saved.
  if (user.email) {
    let stationName: string | null = null
    if (booking.station_id) {
      const { data: s } = await db.from('stations').select('name').eq('id', booking.station_id).maybeSingle()
      stationName = (s?.name as string | undefined) ?? null
    }
    await sendBookingConfirmation(user.email, {
      station_name: stationName,
      date: times.start_at.slice(0, 10),
      start_time: times.start_time,
      end_time: times.end_time,
      duration: input.duration_hours,
      user_count: input.user_count,
      total_amount: Number(booking.total_amount),
    })
  }
  return booking
}

/** The caller's bookings, oldest first, with live status (no writes on read). */
export async function listUserBookings(userId: string, db: SupabaseClient = getSupabase(), now: Date = new Date()) {
  const { data, error } = await db.from('bookings').select('*, stations(*)').eq('user_id', userId).order('start_at', { ascending: true })
  if (error) throw new ApiError(500, 'Failed to load bookings')
  const nowIst = toIstString(now)
  return (data ?? []).map((b) => ({ ...b, status: effectiveStatus(b, nowIst) }))
}

export async function cancelBooking(bookingId: string, userId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('cancel_booking', { p_booking_id: bookingId, p_user_id: userId })
  if (error || !data) throw mapRpcError(error, 'Failed to cancel booking')
  const r = data as { refund_amount: number; cancellation_fee: number }
  return { message: 'Booking cancelled successfully', refund_amount: r.refund_amount, cancellation_fee: r.cancellation_fee }
}

export const uuidParam = z.string().uuid('Invalid id')
