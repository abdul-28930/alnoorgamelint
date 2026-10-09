import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEnv } from '../env'
import { ApiError } from '../http'
import { sendReminderEmail, type MailResult, type ReminderKind } from '../mailer'
import { getSupabase } from '../supabase'
import { toIstString } from '../time'

export const MAX_REMINDERS_PER_RUN = 50
const EMAIL_CONCURRENCY = 5

/**
 * Sending a closer reminder also retires the wider ones, so a booking made 20 minutes ahead gets one
 * "30 minutes" email, not a "30 minutes" and a "1 hour" email back to back.
 */
export function flagsToSet(kind: ReminderKind): Record<string, true> {
  if (kind === '5m') return { reminder_5m_sent: true, reminder_30m_sent: true, reminder_1h_sent: true }
  if (kind === '30m') return { reminder_30m_sent: true, reminder_1h_sent: true }
  return { reminder_1h_sent: true }
}

interface DueReminder { id: string; user_id: string; start_at: string; kind: ReminderKind; station_name: string | null }

export interface CronResult {
  statuses: { started: number; ended: number }
  reminders: { due: number; sent: number; failed: number; no_email: number; skipped?: string }
}

export interface CronDeps {
  db?: SupabaseClient
  now?: Date
  smtpConfigured?: boolean
  send?: (to: string, kind: ReminderKind, d: { station_name: string | null; start_time: string }) => Promise<MailResult>
}

const isSmtpConfigured = () => {
  const env = getEnv()
  return Boolean(env.SMTP_USERNAME && env.SMTP_PASSWORD)
}

/**
 * One scheduled run: persist booking statuses, then email due reminders.
 * A reminder is marked sent ONLY after the email really went out (the old job marked it sent even
 * when SMTP failed, and could never find a recipient because it read the unexposed auth.users table).
 */
export async function runCron(deps: CronDeps = {}): Promise<CronResult> {
  const db = deps.db ?? getSupabase()
  const nowIst = toIstString(deps.now ?? new Date())
  const send = deps.send ?? sendReminderEmail

  const { data: st, error: stError } = await db.rpc('refresh_booking_statuses', { p_now: nowIst })
  if (stError) throw new ApiError(500, 'Failed to refresh booking statuses')
  const result: CronResult = {
    statuses: { started: Number(st?.started ?? 0), ended: Number(st?.ended ?? 0) },
    reminders: { due: 0, sent: 0, failed: 0, no_email: 0 },
  }

  if (!(deps.smtpConfigured ?? isSmtpConfigured())) {
    result.reminders.skipped = 'SMTP not configured'
    return result
  }

  const { data, error } = await db.rpc('due_reminders', { p_now: nowIst, p_limit: MAX_REMINDERS_PER_RUN })
  if (error) throw new ApiError(500, 'Failed to load reminders')
  const due = (data ?? []) as DueReminder[]
  result.reminders.due = due.length

  // user -> pending email lookup. Caching the promise (not the value) keeps concurrent bookings of one user to a single call.
  const emails = new Map<string, Promise<string | null>>()
  const emailOf = (userId: string) => {
    if (!emails.has(userId)) {
      emails.set(userId, db.auth.admin.getUserById(userId).then(({ data }) => data?.user?.email ?? null))
    }
    return emails.get(userId)!
  }
  const sentByKind: Record<ReminderKind, string[]> = { '1h': [], '30m': [], '5m': [] }

  const handle = async (r: DueReminder) => {
    const to = await emailOf(r.user_id)
    if (!to) { result.reminders.no_email++; return }
    const mail = await send(to, r.kind, { station_name: r.station_name, start_time: r.start_at.slice(11, 16) })
    if (mail.sent) { result.reminders.sent++; sentByKind[r.kind].push(r.id) }
    else result.reminders.failed++
  }

  for (let i = 0; i < due.length; i += EMAIL_CONCURRENCY) {
    await Promise.all(due.slice(i, i + EMAIL_CONCURRENCY).map((r) => handle(r).catch((e) => {
      console.error('Reminder failed:', e instanceof Error ? e.message : e)
      result.reminders.failed++
    })))
  }

  for (const kind of Object.keys(sentByKind) as ReminderKind[]) {
    const ids = sentByKind[kind]
    if (ids.length) {
      const { error: updateError } = await db.from('bookings').update(flagsToSet(kind)).in('id', ids)
      if (updateError) console.error('Failed to mark reminders sent:', updateError)
    }
  }
  return result
}
