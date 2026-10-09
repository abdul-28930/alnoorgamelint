import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, badRequest, notFound } from '../../http'
import { buildReceiptPdf, type ReceiptBooking } from '../../receipt'
import { effectiveStatus } from '../../status'
import { getSupabase } from '../../supabase'
import { toIstString } from '../../time'

export async function receiptPdf(bookingId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('bookings')
    .select('*, user_profiles!bookings_user_fk(username, full_name), stations(name, type, hourly_rate)')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw new ApiError(500, 'Failed to load booking')
  if (!data) throw notFound('Booking not found')

  const ended = effectiveStatus(data, toIstString()) === 'ENDED'
  if (!data.checked_in_at && !ended) throw badRequest('Receipt can only be generated for checked-in or ended bookings')

  return buildReceiptPdf(data as ReceiptBooking)
}
