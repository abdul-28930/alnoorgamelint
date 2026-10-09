import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import { getEnv } from './env'

export interface MailResult {
  sent: boolean
  reason?: string
}

const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

let transport: Transporter | undefined

/**
 * Sends one email over SMTP. Never throws: callers get `{ sent: false, reason }`, so a mail outage
 * cannot fail a booking, and reminder jobs can tell a real send from a skipped one.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<MailResult> {
  const env = getEnv()
  if (!env.SMTP_USERNAME || !env.SMTP_PASSWORD) return { sent: false, reason: 'SMTP not configured' }
  try {
    transport ??= nodemailer.createTransport({
      host: env.SMTP_SERVER,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USERNAME, pass: env.SMTP_PASSWORD },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    })
    await transport.sendMail({ from: env.SMTP_USERNAME, to, subject, html })
    return { sent: true }
  } catch (err) {
    console.error('Email send failed:', err instanceof Error ? err.message : err)
    return { sent: false, reason: 'SMTP error' }
  }
}

export interface BookingEmailDetails {
  station_name: string | null
  date: string
  start_time: string | null
  end_time: string | null
  duration: number
  user_count: number
  total_amount: number
}

export function bookingConfirmationHtml(d: BookingEmailDetails): string {
  const time = d.start_time ? `${escapeHtml(d.start_time)} - ${escapeHtml(d.end_time)}` : 'Time is set when you arrive and check in'
  return `<html><body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
    <h1 style="color: #00ffff; text-align: center; margin-bottom: 10px;">Neo Gaming Cafe</h1>
    <h2 style="color: #333; text-align: center;">Booking Confirmed! 🎮</h2>
    <div style="background: #1a1a1a; color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 8px 0;"><strong>Station:</strong> ${escapeHtml(d.station_name ?? 'Assigned at check-in')}</p>
      <p style="margin: 8px 0;"><strong>Date:</strong> ${escapeHtml(d.date)}</p>
      <p style="margin: 8px 0;"><strong>Time:</strong> ${time}</p>
      <p style="margin: 8px 0;"><strong>Duration:</strong> ${escapeHtml(d.duration)} hours</p>
      <p style="margin: 8px 0;"><strong>Users:</strong> ${escapeHtml(d.user_count)} user(s)</p>
      <p style="margin: 8px 0; font-size: 18px;"><strong>Total: ₹${escapeHtml(d.total_amount)}</strong></p>
    </div>
    <p style="text-align: center; color: #666; font-size: 16px;">See you at Neo Gaming Cafe! 🚀</p>
  </div></body></html>`
}

export function sendBookingConfirmation(to: string, details: BookingEmailDetails): Promise<MailResult> {
  return sendEmail(to, 'Booking Confirmed - Neo Gaming Cafe', bookingConfirmationHtml(details))
}
