import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest } from '../http'
import { buildReceiptPdf } from '../receipt'
import { getSupabase } from '../supabase'
import { getWhatsappConfig, normalizePhone } from '../whatsapp/client'
import { bookingReference, formatAmount } from '../whatsapp/format'
import { loadReceiptBooking } from './admin/receipt'
import { notify, type Deps, type NotifyResult } from './notifications'

export const RECEIPT_BUCKET = 'receipts'
const LINK_SECONDS = 7 * 24 * 3600
const SETUP_HINT = 'Run sql/setup/14_receipts_bucket.sql in Supabase'

export const receiptSendSchema = z.object({ phone: z.string().trim().max(20).optional() }).default({})

export const maskPhone = (phone: string) => `••••${phone.slice(-4)}`

/**
 * "Send receipt on WhatsApp": builds the receipt PDF, keeps it in private storage, and sends the customer a temporary link
 * to it with the receipt template. Goes to the number on the customer's profile (or a guest's number), or to a number staff
 * type. Pressing it twice within 10 minutes sends once.
 */
export async function sendReceiptOnWhatsapp(
  bookingId: string,
  input: z.infer<typeof receiptSendSchema>,
  sentBy: string,
  db: SupabaseClient = getSupabase(),
  deps: Deps & { pdf?: (b: Awaited<ReturnType<typeof loadReceiptBooking>>) => Promise<Uint8Array> } = {},
): Promise<{ status: NotifyResult['status']; sent_to: string; detail?: string }> {
  if ((deps.cfg === undefined ? getWhatsappConfig() : deps.cfg) === null) {
    throw badRequest('WhatsApp is not configured. Set the keys on the server first.')
  }
  const booking = await loadReceiptBooking(bookingId, db)

  let phoneRaw: string | null = input.phone?.trim() || null
  let name = booking.user_profiles?.full_name || booking.user_profiles?.username || booking.guest_name || 'there'
  if (!phoneRaw && booking.user_id) {
    const { data: profile } = await db.from('user_profiles').select('phone').eq('user_id', booking.user_id).maybeSingle()
    phoneRaw = (profile?.phone as string | null | undefined) ?? null
  }
  phoneRaw ??= booking.guest_phone ?? null
  const phone = normalizePhone(phoneRaw)
  if (!phone) throw badRequest(phoneRaw ? 'That is not a valid 10-digit mobile number' : 'There is no WhatsApp number on file for this customer. Type one.')

  const dedupeKey = `receipt:${bookingId}:${Math.floor(Date.now() / (10 * 60 * 1000))}`
  const { data: already } = await db.from('notification_log').select('id').eq('dedupe_key', dedupeKey).maybeSingle()
  if (already) return { status: 'duplicate', sent_to: maskPhone(phone), detail: 'This receipt was just sent. Wait 10 minutes to send it again.' }

  const reference = bookingReference(bookingId)
  const pdf = await (deps.pdf ?? buildReceiptPdf)(booking)
  const path = `${bookingId}/receipt-${Date.now()}.pdf`
  const stored = await db.storage.from(RECEIPT_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false })
  if (stored.error) {
    console.error('Failed to store the receipt:', stored.error.message)
    throw new ApiError(500, `Could not save the receipt file. ${SETUP_HINT}`)
  }
  const signed = await db.storage.from(RECEIPT_BUCKET).createSignedUrl(path, LINK_SECONDS)
  if (signed.error || !signed.data?.signedUrl) {
    console.error('Failed to link the receipt:', signed.error?.message)
    throw new ApiError(500, 'Could not create the receipt link')
  }

  const out = await notify({
    event: 'receipt_ready', phone, name, userId: booking.user_id ?? null, sentBy, dedupeKey,
    vars: { name, reference, amount: formatAmount(booking.total_amount) },
    fileUrl: signed.data.signedUrl, pdfName: `Receipt-${reference}.pdf`,
    refs: { booking_id: bookingId },
  }, { ...deps, db })
  return { status: out.status, sent_to: maskPhone(phone), detail: out.detail }
}
