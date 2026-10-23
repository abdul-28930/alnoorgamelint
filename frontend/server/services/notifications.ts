import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest, notFound } from '../http'
import { getSupabase } from '../supabase'
import { EVENTS, EVENT_KEYS, isEvent, type WhatsappEvent } from '../whatsapp/events'
import { checkAccount, cleanParam, getWhatsappConfig, normalizePhone, sendTemplate, type SendResult, type TemplateSend, type WhatsappConfig } from '../whatsapp/client'

/**
 * WhatsApp messages. `notify` is called after the real action (a booking, a registration) has succeeded, and it never
 * throws: a message that cannot be sent is logged for staff, it never stops a booking or a sign-up.
 */

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Deps { db?: SupabaseClient; fetchImpl?: typeof fetch; cfg?: WhatsappConfig | null }

export interface NotifyInput {
  event: WhatsappEvent
  phone: string | null | undefined
  vars: Record<string, string | number | null | undefined>
  name?: string
  urlParam?: string
  fileUrl?: string
  pdfName?: string
  /** the same key is never sent twice, e.g. `booking:<id>:confirmed` */
  dedupeKey?: string
  userId?: string | null
  refs?: { booking_id?: string; tournament_id?: string; entrant_id?: string }
  sentBy?: string | null
}

export interface NotifyResult { status: 'sent' | 'failed' | 'unconfirmed' | 'skipped' | 'duplicate'; id?: string; detail?: string }

const MAX_ATTEMPTS = 3
const SETUP_HINT = 'Run sql/setup/13_whatsapp.sql in Supabase'

/** Variables in the order of the approved template */
export function orderedParams(event: WhatsappEvent, vars: NotifyInput['vars']): string[] {
  return EVENTS[event].vars.map((key) => cleanParam(vars[key]))
}

async function templateFor(db: SupabaseClient, event: WhatsappEvent): Promise<{ name: string; enabled: boolean }> {
  const { data } = await db.from('whatsapp_templates').select('template_name, enabled').eq('event', event).maybeSingle()
  return { name: (data?.template_name as string | undefined) ?? EVENTS[event].defaultTemplate, enabled: data?.enabled !== false }
}

async function optedOut(db: SupabaseClient, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const { data } = await db.from('user_profiles').select('whatsapp_opt_in').eq('user_id', userId).maybeSingle()
  return data?.whatsapp_opt_in === false
}

/** Sends the message stored in a log row and records what happened. Used by notify, the retry job and "resend". */
async function deliver(db: SupabaseClient, row: Row, cfg: WhatsappConfig, fetchImpl?: typeof fetch): Promise<NotifyResult> {
  const result: SendResult = await sendTemplate(cfg, row.send_args as TemplateSend, fetchImpl)
  const status = result.outcome
  const { error } = await db
    .from('notification_log')
    .update({
      status,
      attempts: (row.attempts ?? 0) + 1,
      last_error: status === 'sent' ? null : result.detail,
      provider_response: result.detail,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', row.id)
  if (error) console.error('Failed to update the notification log:', error.message)
  return { status, id: row.id, detail: status === 'sent' ? undefined : result.detail }
}

export async function notify(input: NotifyInput, deps: Deps = {}): Promise<NotifyResult> {
  try {
    const db = deps.db ?? getSupabase()
    const cfg = deps.cfg === undefined ? getWhatsappConfig() : deps.cfg
    const template = await templateFor(db, input.event)
    const phone = normalizePhone(input.phone)

    const skip = async (reason: string): Promise<NotifyResult> => {
      // skipped messages are logged too, so staff can see why a customer got nothing
      await db.from('notification_log').insert({
        event: input.event, recipient_phone: phone, recipient_name: input.name ?? null, user_id: input.userId ?? null,
        ...input.refs, template_name: template.name, status: 'skipped', last_error: reason, sent_by: input.sentBy ?? null,
      })
      return { status: 'skipped', detail: reason }
    }

    if (!cfg) return { status: 'skipped', detail: 'WhatsApp is not configured' } // nothing to show staff yet
    if (!template.enabled) return skip('This message is switched off in Settings')
    if (!phone) return skip('No valid mobile number')
    if (await optedOut(db, input.userId)) return skip('The customer turned WhatsApp messages off')

    const send: TemplateSend = {
      contact: phone,
      template: template.name,
      params: orderedParams(input.event, input.vars),
      ...(input.name ? { name: input.name } : {}),
      ...(input.urlParam ? { urlParam: input.urlParam } : {}),
      ...(input.fileUrl ? { fileUrl: input.fileUrl, pdfName: input.pdfName } : {}),
    }
    const { data: row, error } = await db
      .from('notification_log')
      .insert({
        event: input.event, dedupe_key: input.dedupeKey ?? null, recipient_phone: phone, recipient_name: input.name ?? null,
        user_id: input.userId ?? null, ...input.refs, template_name: template.name, send_args: send, status: 'pending',
        sent_by: input.sentBy ?? null,
      })
      .select()
      .single()
    if (error?.code === '23505') return { status: 'duplicate' }
    if (error || !row) {
      console.error('Failed to write the notification log:', error?.message)
      return { status: 'failed', detail: `The notification log is not available. ${SETUP_HINT}` }
    }
    return await deliver(db, { ...row, send_args: send }, cfg, deps.fetchImpl)
  } catch (e) {
    console.error('Notification failed:', e instanceof Error ? e.message : e)
    return { status: 'failed', detail: 'Unexpected error while sending' }
  }
}

/** Run by the scheduled job: messages that clearly failed are tried again (up to 3 times, within a day). */
export async function retryFailedNotifications(deps: Deps = {}, limit = 20): Promise<{ retried: number; sent: number }> {
  const db = deps.db ?? getSupabase()
  const cfg = deps.cfg === undefined ? getWhatsappConfig() : deps.cfg
  if (!cfg) return { retried: 0, sent: 0 }
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data, error } = await db
    .from('notification_log')
    .select('*')
    .eq('status', 'failed')
    .lt('attempts', MAX_ATTEMPTS)
    .gt('created_at', since)
    .not('send_args', 'is', null)
    .order('created_at')
    .limit(limit)
  if (error || !data?.length) return { retried: 0, sent: 0 }
  let sent = 0
  for (const row of data as Row[]) {
    const out = await deliver(db, row, cfg, deps.fetchImpl)
    if (out.status === 'sent') sent++
  }
  return { retried: data.length, sent }
}

// ---- staff screens ------------------------------------------------------------------------------------------------

export const templateUpdateSchema = z
  .object({
    template_name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'Use lowercase letters, numbers and underscores').optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.template_name !== undefined || v.enabled !== undefined, 'Nothing to update')

export const testSendSchema = z.object({ event: z.string(), phone: z.string().trim().min(10).max(20) })
export const logQuery = z.object({
  status: z.enum(['pending', 'sent', 'failed', 'unconfirmed', 'skipped']).optional(),
  event: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
})

export async function getAdminStatus(deps: Deps & { check?: boolean } = {}) {
  const db = deps.db ?? getSupabase()
  const cfg = deps.cfg === undefined ? getWhatsappConfig() : deps.cfg
  const [{ data: rows, error: tplError }, { error: logError }] = await Promise.all([
    db.from('whatsapp_templates').select('event, template_name, enabled'),
    db.from('notification_log').select('id').limit(1),
  ])
  const byEvent = new Map(((rows ?? []) as Row[]).map((r) => [r.event as string, r]))
  return {
    configured: Boolean(cfg),
    setup_complete: !tplError && !logError,
    setup_hint: tplError || logError ? SETUP_HINT : null,
    account: cfg && deps.check ? await checkAccount(cfg, deps.fetchImpl) : null,
    templates: EVENT_KEYS.map((event) => ({
      event,
      label: EVENTS[event].label,
      description: EVENTS[event].description,
      vars: EVENTS[event].vars,
      sample: EVENTS[event].sample,
      url_button: Boolean(EVENTS[event].urlButton),
      document: Boolean(EVENTS[event].document),
      default_template: EVENTS[event].defaultTemplate,
      template_name: (byEvent.get(event)?.template_name as string | undefined) ?? EVENTS[event].defaultTemplate,
      enabled: byEvent.get(event)?.enabled !== false,
    })),
  }
}

export async function updateTemplate(event: string, patch: z.infer<typeof templateUpdateSchema>, db: SupabaseClient = getSupabase()) {
  if (!isEvent(event)) throw notFound('Unknown message')
  const current = await templateFor(db, event)
  const { error } = await db.from('whatsapp_templates').upsert({
    event,
    template_name: patch.template_name ?? current.name,
    enabled: patch.enabled ?? current.enabled,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    console.error('Failed to save the template:', error.message)
    throw new ApiError(500, `Failed to save. ${SETUP_HINT}`)
  }
  return { message: 'Saved' }
}

/** A real message with sample values, to the number staff type, to prove the template and the account work. */
export async function sendTest(input: z.infer<typeof testSendSchema>, sentBy: string, deps: Deps = {}) {
  if (!isEvent(input.event)) throw notFound('Unknown message')
  const def = EVENTS[input.event]
  if (def.document) throw badRequest('The receipt template needs a real receipt. Use "Send receipt on WhatsApp" on a booking.')
  if (!normalizePhone(input.phone)) throw badRequest('Enter a 10-digit Indian mobile number')
  const out = await notify({
    event: input.event, phone: input.phone, vars: def.sample, name: def.sample.name, sentBy,
    ...(def.urlButton ? { urlParam: '00000000-0000-4000-8000-000000000000' } : {}),
  }, deps)
  if (out.status === 'skipped' && out.detail === 'WhatsApp is not configured') {
    throw badRequest('WhatsApp is not configured: set WHATSAPP_LICENSE_NUMBER and WHATSAPP_API_KEY on the server')
  }
  return out
}

const PAGE_SIZE = 50

export async function listLog(q: z.infer<typeof logQuery>, db: SupabaseClient = getSupabase()) {
  let query = db
    .from('notification_log')
    .select('id, event, recipient_phone, recipient_name, template_name, status, attempts, last_error, provider_response, created_at, sent_at, sent_by', { count: 'exact' })
  if (q.status) query = query.eq('status', q.status)
  if (q.event) query = query.eq('event', q.event)
  const from = (q.page - 1) * PAGE_SIZE
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
  if (error) throw new ApiError(500, `Failed to load the log. ${SETUP_HINT}`)
  return { data: data ?? [], total: count ?? 0, page: q.page, limit: PAGE_SIZE }
}

/** Staff press "Send again" on a failed, unconfirmed or skipped message. */
export async function resend(id: string, deps: Deps = {}) {
  const db = deps.db ?? getSupabase()
  const cfg = deps.cfg === undefined ? getWhatsappConfig() : deps.cfg
  if (!cfg) throw badRequest('WhatsApp is not configured')
  const { data: row, error } = await db.from('notification_log').select('*').eq('id', id).maybeSingle()
  if (error) throw new ApiError(500, 'Failed to load the message')
  if (!row) throw notFound('Message not found')
  if (row.status === 'sent') throw badRequest('That message was already sent')
  if (!row.send_args) throw badRequest('That message was never prepared (it was skipped), so there is nothing to send again')
  return deliver(db, row as Row, cfg, deps.fetchImpl)
}
