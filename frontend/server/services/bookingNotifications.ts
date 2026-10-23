import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bookingReference, formatAmount, formatClock, formatDay } from '../whatsapp/format'
import { isWhatsappConfigured } from '../whatsapp/client'
import { notify, type Deps, type NotifyResult } from './notifications'

export interface CreatedBooking {
  id: string
  total_amount?: unknown
}
export interface BookingFacts {
  start_at: string // IST "YYYY-MM-DD HH:MM:SS"
  start_time: string | null // null = a reservation without a time
  duration_hours: number
  station_name: string | null
  station_type: string | null
}

/**
 * Tells the customer their booking (with a time) or reservation (no time yet) was received. Runs after the booking is
 * saved, never throws, and sends at most once per booking.
 */
export async function notifyBookingCreated(
  db: SupabaseClient, userId: string, booking: CreatedBooking, facts: BookingFacts, deps: Deps = {},
): Promise<NotifyResult | null> {
  if (deps.cfg === null || (deps.cfg === undefined && !isWhatsappConfigured())) return null
  try {
    const { data: profile } = await db.from('user_profiles').select('full_name, username, phone').eq('user_id', userId).maybeSingle()
    const name = (profile?.full_name || profile?.username || 'there') as string
    const base = {
      phone: (profile?.phone ?? null) as string | null,
      name, userId,
      refs: { booking_id: booking.id },
      dedupeKey: `booking:${booking.id}:created`,
    }
    const withDb: Deps = { ...deps, db }
    const common = { name, date: formatDay(facts.start_at.slice(0, 10)), amount: formatAmount(booking.total_amount), reference: bookingReference(booking.id) }
    if (facts.start_time === null) {
      return await notify({ ...base, event: 'reservation_received', vars: { ...common, station_type: facts.station_type ?? 'gaming' } }, withDb)
    }
    return await notify({
      ...base,
      event: 'booking_confirmed',
      vars: {
        ...common,
        station: facts.station_name ?? (facts.station_type ? `${facts.station_type} (we will assign your station)` : 'To be assigned'),
        time: formatClock(facts.start_time),
        hours: facts.duration_hours,
      },
    }, withDb)
  } catch (e) {
    console.error('Booking notification failed:', e instanceof Error ? e.message : e)
    return null
  }
}
