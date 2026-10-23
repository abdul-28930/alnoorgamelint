import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, badRequest, notFound } from '../../http'
import { buildReceiptPdf, type ReceiptBooking } from '../../receipt'
import { effectiveStatus } from '../../status'
import { getSupabase } from '../../supabase'
import { toIstString } from '../../time'

/** The booking as the receipt needs it (customer, station), once we know it can have a receipt. */
export async function loadReceiptBooking(bookingId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('bookings')
    .select('*, user_profiles!bookings_user_fk(username, full_name), stations(name, type, hourly_rate)')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw new ApiError(500, 'Failed to load booking')
  if (!data) throw notFound('Booking not found')

  const ended = effectiveStatus(data, toIstString()) === 'ENDED'
  if (!data.checked_in_at && !ended) throw badRequest('Receipt can only be generated for checked-in or ended bookings')
  return data as ReceiptBooking & { user_id: string | null; guest_phone?: string | null }
}

export async function receiptPdf(bookingId: string, db: SupabaseClient = getSupabase()) {
  return buildReceiptPdf(await loadReceiptBooking(bookingId, db))
}
