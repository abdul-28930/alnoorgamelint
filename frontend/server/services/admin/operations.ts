import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest, notFound } from '../../http'
import { getSupabase } from '../../supabase'
import { toIstString } from '../../time'
import { mapRpcError } from '../bookings'

export const checkinQuery = z.object({ station_id: z.string().uuid('Invalid station id') })

/** Assigns the station and starts the session; all rules live in one atomic database function. */
export async function checkin(bookingId: string, stationId: string, db: SupabaseClient = getSupabase(), now = new Date()) {
  const { data, error } = await db.rpc('checkin_booking', {
    p_booking_id: bookingId,
    p_station_id: stationId,
    p_now_ist: toIstString(now),
  })
  if (error || !data) throw mapRpcError(error, 'Failed to check in booking')
  return data
}

export async function startTimer(bookingId: string, db: SupabaseClient = getSupabase()) {
  const { data: b, error } = await db.from('bookings').select('checked_in_at, timer_started_at').eq('id', bookingId).maybeSingle()
  if (error) throw new ApiError(500, 'Failed to start timer')
  if (!b) throw notFound('Booking not found')
  if (!b.checked_in_at) throw badRequest('Booking must be checked in before starting the timer')
  if (b.timer_started_at) throw badRequest('Timer already running')

  // conditional update: two staff clicking at once cannot both start it
  const { data, error: updateError } = await db
    .from('bookings')
    .update({ timer_started_at: new Date().toISOString() })
    .eq('id', bookingId)
    .is('timer_started_at', null)
    .select()
    .maybeSingle()
  if (updateError) throw new ApiError(500, 'Failed to start timer')
  if (!data) throw badRequest('Timer already running')
  return data
}

export async function stopTimer(bookingId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('stop_timer', { p_booking_id: bookingId })
  if (error || !data) throw mapRpcError(error, 'Failed to stop timer')
  return data
}

/** Starts grace time once; calling it again returns the original start instead of resetting the clock. */
export async function startGrace(bookingId: string, db: SupabaseClient = getSupabase()) {
  const startedAt = new Date().toISOString()
  const { data, error } = await db
    .from('bookings')
    .update({ grace_time_started_at: startedAt })
    .eq('id', bookingId)
    .is('grace_time_started_at', null)
    .select('grace_time_started_at')
    .maybeSingle()
  if (error) throw new ApiError(500, 'Failed to start grace time')
  if (data) return { message: 'Grace time started', grace_started_at: startedAt }

  const { data: existing } = await db.from('bookings').select('grace_time_started_at').eq('id', bookingId).maybeSingle()
  if (!existing) throw notFound('Booking not found')
  return { message: 'Grace time started', grace_started_at: existing.grace_time_started_at }
}

export async function extendHour(bookingId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('extend_booking_hour', { p_booking_id: bookingId })
  if (error || !data) throw mapRpcError(error, 'Failed to extend booking', { STATION_REQUIRED: [400, 'Booking has no station rate to extend'] })
  return data
}
