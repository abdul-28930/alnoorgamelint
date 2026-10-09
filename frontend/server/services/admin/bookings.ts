import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, notFound } from '../../http'
import { computePrice, paymentStatus, remainingAmount } from '../../pricing'
import { effectiveStatus } from '../../status'
import { getSupabase } from '../../supabase'
import { addDays, istDate, toIstString } from '../../time'

const BOOKING_JOINS = '*, stations(*), user_profiles!bookings_user_fk(username, full_name)'
const UNASSIGNED = 'Unassigned'

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

export const dateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
})

const withLiveStatus = <T extends Record<string, unknown>>(rows: T[] | null, now = new Date()) => {
  const nowIst = toIstString(now)
  return (rows ?? []).map((b) => ({ ...b, status: effectiveStatus(b as never, nowIst) }))
}

/** One query (data + exact count) per page, instead of the old two. */
export async function listBookings(
  { page, limit }: z.infer<typeof pageQuery>,
  cancelled: boolean,
  db: SupabaseClient = getSupabase(),
) {
  const from = (page - 1) * limit
  let q = db.from('bookings').select(BOOKING_JOINS, { count: 'exact' })
  q = cancelled ? q.eq('status', 'CANCELLED') : q.neq('status', 'CANCELLED')
  const { data, count, error } = await q.order('start_at', { ascending: false }).range(from, from + limit - 1)
  if (error) throw new ApiError(500, 'Failed to load bookings')
  return { data: cancelled ? data : withLiveStatus(data), total: count ?? 0, page, limit }
}

function groupByStation<T extends { stations?: { name?: string } | null }>(rows: T[]) {
  const out: Record<string, T[]> = {}
  for (const r of rows) (out[r.stations?.name ?? UNASSIGNED] ??= []).push(r)
  return out
}

export const calendarQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Bounded (default: today + 30 days, max 1000 rows). Bookings without a station no longer crash it. */
export async function calendar(q: z.infer<typeof calendarQuery>, db: SupabaseClient = getSupabase()) {
  const from = q.from ?? istDate()
  const to = q.to ?? addDays(from, 30)
  const { data, error } = await db
    .from('bookings')
    .select('*, stations(name, type)')
    .neq('status', 'CANCELLED')
    .gte('start_at', `${from} 00:00:00`)
    .lt('start_at', `${addDays(to, 1)} 00:00:00`)
    .order('start_at')
    .limit(1000)
  if (error) throw new ApiError(500, 'Failed to load calendar')
  return groupByStation(data ?? [])
}

/** All of a day's non-cancelled bookings, grouped by station name, with the customer attached (one query). */
export async function bookingsByDate(date: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('bookings')
    .select(BOOKING_JOINS)
    .neq('status', 'CANCELLED')
    .gte('start_at', `${date} 00:00:00`)
    .lt('start_at', `${addDays(date, 1)} 00:00:00`)
    .order('start_at')
  if (error) throw new ApiError(500, 'Failed to load bookings')
  return groupByStation(withLiveStatus(data))
}

export async function stationsWithReservations(date: string, db: SupabaseClient = getSupabase()) {
  const customer = 'user_profiles!bookings_user_fk(username, full_name)'
  const open = (q: ReturnType<ReturnType<SupabaseClient['from']>['select']>) => q.neq('status', 'CANCELLED').neq('status', 'ENDED')
  const [stationsRes, resRes, checkedRes, unassignedRes] = await Promise.all([
    db.from('stations').select('*').eq('active', true).order('name'),
    open(db.from('bookings').select(`*, ${customer}, stations(*)`).gte('start_at', `${date} 00:00:00`).lt('start_at', `${addDays(date, 1)} 00:00:00`).is('start_time', null)),
    // no date filter: check-in rewrites start_at to "now"
    open(db.from('bookings').select(`*, ${customer}, stations(*)`).not('start_time', 'is', null).eq('checked_in', true)),
    // every unassigned reservation, regardless of date, for the sidebar
    open(db.from('bookings').select(`*, ${customer}`).is('station_id', null).is('start_time', null)),
  ])
  if (stationsRes.error || resRes.error || checkedRes.error || unassignedRes.error) throw new ApiError(500, 'Failed to load reservations')

  type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const stations = (stationsRes.data ?? []) as Row[]
  const byStation = new Map<string, { station: Row; reservations: Row[] }>(
    stations.map((s) => [s.id as string, { station: s, reservations: [] }]),
  )
  const unassigned: Row[] = []
  const seen = new Set<string>()

  for (const b of (resRes.data ?? []) as Row[]) {
    seen.add(b.id)
    ;(byStation.get(b.station_id)?.reservations ?? unassigned).push(b)
  }
  // Only the most recent check-in per station is shown; older ones are still ONGOING in the database.
  const latest = new Map<string, Row>()
  for (const b of (checkedRes.data ?? []) as Row[]) {
    seen.add(b.id)
    const cur = latest.get(b.station_id)
    if (!b.station_id || !byStation.has(b.station_id)) unassigned.push(b)
    else if (!cur || String(b.checked_in_at) > String(cur.checked_in_at)) latest.set(b.station_id, b)
  }
  latest.forEach((b, stationId) => byStation.get(stationId)!.reservations.push(b))
  for (const b of (unassignedRes.data ?? []) as Row[]) if (!seen.has(b.id)) unassigned.push(b)

  const out = stations.map((s) => byStation.get(s.id as string)!)
  if (unassigned.length) {
    out.push({ station: { id: null, name: 'Unassigned Reservations', type: 'MIXED' }, reservations: unassigned })
  }
  return out
}

// ---- editing ----------------------------------------------------------------------------------

const money = z.number().finite().min(0)
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
const istDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/)

/** Only these fields can be edited (unknown keys are dropped, as before), now with types and ranges. */
export const updateBookingSchema = z.object({
  user_id: z.string().uuid(),
  station_id: z.string().uuid().nullable(),
  start_at: istDateTime,
  end_at: istDateTime,
  paid: z.boolean(),
  status: z.enum(['PENDING', 'UPCOMING', 'ONGOING', 'ENDED', 'CANCELLED']),
  total_amount: money,
  duration_hours: z.number().int().min(1).max(24),
  booking_notes: z.string().max(1000).nullable(),
  payment_method: z.string().max(50).nullable(),
  cancelled_at: z.string().nullable(),
  start_time: hhmm.nullable(),
  end_time: hhmm.nullable(),
  user_count: z.number().int().min(1).max(20),
  advance_amount: money,
  advance_paid: z.boolean(),
  advance_payment_method: z.string().max(50).nullable(),
  payment_status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'ADVANCE_PAID', 'PREPAID']),
  remaining_amount: z.number().finite(),
  amount_paid: money,
  food_items: z.array(z.unknown()).max(100),
  food_total: money,
  refund_amount: money,
  cancellation_fee: money,
  discount_type: z.enum(['NONE', 'PERCENTAGE', 'AMOUNT']),
  discount_value: money,
  original_amount: money,
  custom_hourly_rate: money.nullable(),
  hourly_rate: money, // an alias: stored as custom_hourly_rate
  checked_in: z.boolean(),
  coupon_code: z.string().max(50).nullable(),
  coupon_discount: money,
}).partial()

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>

const PRICE_KEYS = ['duration_hours', 'discount_type', 'discount_value', 'hourly_rate', 'user_count', 'food_total'] as const

export async function updateBooking(id: string, input: UpdateBookingInput, db: SupabaseClient = getSupabase()) {
  const fields: Record<string, unknown> = { ...input }
  if ('hourly_rate' in fields) {
    fields.custom_hourly_rate = fields.hourly_rate
    delete fields.hourly_rate
  }
  if (Object.keys(fields).length === 0) throw new ApiError(400, 'No valid fields to update')

  if (PRICE_KEYS.some((k) => k in input)) {
    const { data: b, error } = await db.from('bookings').select('*, stations(hourly_rate)').eq('id', id).maybeSingle()
    if (error) throw new ApiError(500, 'Failed to update booking')
    if (!b) throw notFound('Booking not found')

    const rate = Number(input.hourly_rate ?? b.custom_hourly_rate ?? b.stations?.hourly_rate ?? 0)
    const price = computePrice({
      hourlyRate: rate,
      durationHours: input.duration_hours ?? b.duration_hours ?? 1,
      userCount: input.user_count ?? b.user_count ?? 1,
      foodTotal: Number(input.food_total ?? b.food_total ?? 0),
      discountType: input.discount_type ?? b.discount_type ?? 'NONE',
      discountValue: Number(input.discount_value ?? b.discount_value ?? 0),
      couponDiscount: Number(input.coupon_discount ?? b.coupon_discount ?? 0),
    })
    const paid = Number(input.amount_paid ?? b.amount_paid ?? 0)
    fields.original_amount = price.originalAmount
    fields.total_amount = price.totalAmount
    fields.remaining_amount = remainingAmount(price.totalAmount, paid)
    // A bigger bill must not stay "PAID" (and a smaller one must not stay "PARTIAL"); prepaid/advance states are left alone.
    if (!('payment_status' in input) && ['PAID', 'PARTIAL', 'PENDING'].includes(b.payment_status)) {
      fields.payment_status = paymentStatus(price.totalAmount, paid)
      fields.paid = fields.payment_status === 'PAID'
    }
  }

  const { data, error } = await db.from('bookings').update(fields).eq('id', id).select().maybeSingle()
  if (error) throw new ApiError(500, 'Failed to update booking')
  if (!data) throw notFound('Booking not found')
  return data
}

export const paymentSchema = z.object({ amount_paid: z.number().finite().min(0).default(0) })

/** Sets the total received so far (not an increment) and derives remaining / status / paid. */
export async function recordPayment(id: string, amountPaid: number, db: SupabaseClient = getSupabase()) {
  const { data: b, error } = await db.from('bookings').select('total_amount, advance_amount').eq('id', id).maybeSingle()
  if (error) throw new ApiError(500, 'Failed to update payment')
  if (!b) throw notFound('Booking not found')

  const total = Number(b.total_amount ?? 0)
  const status = paymentStatus(total, amountPaid)
  const advance = Number(b.advance_amount ?? 0)
  const { data, error: updateError } = await db
    .from('bookings')
    .update({
      amount_paid: amountPaid,
      remaining_amount: remainingAmount(total, amountPaid),
      payment_status: status,
      paid: status === 'PAID',
      // staff confirming the advance at the counter is what marks it paid
      ...(advance > 0 && amountPaid >= advance ? { advance_paid: true } : {}),
    })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (updateError) throw new ApiError(500, 'Failed to update payment')
  if (!data) throw notFound('Booking not found')
  return data
}
