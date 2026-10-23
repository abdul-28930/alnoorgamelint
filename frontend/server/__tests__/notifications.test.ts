import { describe, expect, it, vi } from 'vitest'
import { fakeDb, type Call } from './fakeDb'
import {
  getAdminStatus, listLog, logQuery, notify, orderedParams, resend, retryFailedNotifications, sendTest, templateUpdateSchema, testSendSchema, updateTemplate,
} from '../services/notifications'
import { EVENTS, EVENT_KEYS } from '../whatsapp/events'

const cfg = { licenseNumber: 'L1', apiKey: 'K1', baseUrl: 'https://wa.test/api' }
const has = (c: Call[], m: string) => c.some((x) => x.method === m)
const arg = (c: Call[], m: string) => c.find((x) => x.method === m)?.args[0] as Record<string, unknown> | undefined
const ok = (body = '{"status":"success"}') => vi.fn(async () => new Response(body)) as unknown as typeof fetch & ReturnType<typeof vi.fn>

const world = (over: { template?: object | null; optIn?: boolean; insertError?: object; logRow?: object } = {}) =>
  fakeDb({
    tables: {
      whatsapp_templates: { data: 'template' in over ? over.template : { template_name: 'booking_confirmed', enabled: true } },
      user_profiles: { data: { whatsapp_opt_in: over.optIn ?? true } },
      notification_log: (calls: Call[]) =>
        has(calls, 'insert') && has(calls, 'select')
          ? { data: over.insertError ? null : { id: 'n1', attempts: 0, ...over.logRow }, error: over.insertError ?? null }
          : {},
    },
  })

const input = { event: 'booking_confirmed' as const, phone: '98765 43210', vars: EVENTS.booking_confirmed.sample, name: 'Rahul', userId: 'u1', dedupeKey: 'booking:b1' }

describe('events', () => {
  it('every event has a sample for each of its variables', () => {
    for (const key of EVENT_KEYS) for (const v of EVENTS[key].vars) expect(EVENTS[key].sample[v], `${key}.${v}`).toBeTruthy()
  })
  it('orders variables as the template expects and tidies them', () => {
    expect(orderedParams('match_call', { tournament: 'NEO RIFT,\nS1', name: 'Rahul' })).toEqual(['Rahul', 'NEO RIFT S1'])
    expect(orderedParams('match_call', { name: 'Rahul' })).toEqual(['Rahul', '-'])
  })
})

describe('notify', () => {
  it('sends, and logs what the provider said', async () => {
    const w = world()
    const f = ok()
    const out = await notify(input, { db: w.db, cfg, fetchImpl: f })
    expect(out).toMatchObject({ status: 'sent', id: 'n1' })
    expect(f).toHaveBeenCalledTimes(1)
    const url = (f as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0]
    expect(url.searchParams.get('Contact')).toBe('919876543210')
    expect(url.searchParams.get('Template')).toBe('booking_confirmed')
    expect(url.searchParams.get('Param')).toBe('Rahul,Afterlife PS5 Omega s3,31 Oct 2026,4:00 PM,2,150,NGC1A2B')
    const inserted = w.log.find((e) => e.table === 'notification_log' && has(e.calls, 'insert'))!.calls
    expect(arg(inserted, 'insert')).toMatchObject({ event: 'booking_confirmed', dedupe_key: 'booking:b1', recipient_phone: '919876543210', status: 'pending' })
    const update = w.log.filter((e) => e.table === 'notification_log' && has(e.calls, 'update')).map((e) => arg(e.calls, 'update'))
    expect(update[0]).toMatchObject({ status: 'sent', attempts: 1, last_error: null })
  })
  it('uses the template name staff set in Settings', async () => {
    const f = ok()
    await notify(input, { db: world({ template: { template_name: 'booking_v2', enabled: true } }).db, cfg, fetchImpl: f })
    expect((f as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0].searchParams.get('Template')).toBe('booking_v2')
  })
  it('records a clear failure, and an unclear reply as unconfirmed', async () => {
    expect(await notify(input, { db: world().db, cfg, fetchImpl: ok('Invalid license') })).toMatchObject({ status: 'failed' })
    expect(await notify(input, { db: world().db, cfg, fetchImpl: ok('???') })).toMatchObject({ status: 'unconfirmed' })
  })
  it('does nothing, quietly, when WhatsApp is not configured', async () => {
    const w = world()
    const f = ok()
    expect(await notify(input, { db: w.db, cfg: null, fetchImpl: f })).toMatchObject({ status: 'skipped', detail: 'WhatsApp is not configured' })
    expect(f).not.toHaveBeenCalled()
    expect(w.log.some((e) => e.table === 'notification_log')).toBe(false)
  })
  it('skips, and says why, for a switched-off message, a bad number, or a member who opted out', async () => {
    const f = ok()
    const off = world({ template: { template_name: 'x', enabled: false } })
    expect(await notify(input, { db: off.db, cfg, fetchImpl: f })).toMatchObject({ status: 'skipped', detail: expect.stringContaining('switched off') })
    expect(await notify({ ...input, phone: '12345' }, { db: world().db, cfg, fetchImpl: f })).toMatchObject({ status: 'skipped', detail: 'No valid mobile number' })
    expect(await notify(input, { db: world({ optIn: false }).db, cfg, fetchImpl: f })).toMatchObject({ status: 'skipped', detail: expect.stringContaining('turned WhatsApp') })
    expect(f).not.toHaveBeenCalled()
    const skipped = off.log.find((e) => e.table === 'notification_log' && has(e.calls, 'insert'))!.calls
    expect(arg(skipped, 'insert')).toMatchObject({ status: 'skipped' })
  })
  it('never sends the same thing twice', async () => {
    const f = ok()
    const out = await notify(input, { db: world({ insertError: { code: '23505' } }).db, cfg, fetchImpl: f })
    expect(out.status).toBe('duplicate')
    expect(f).not.toHaveBeenCalled()
  })
  it('does not send, and does not throw, when the log table is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = ok()
    const out = await notify(input, { db: world({ insertError: { code: '42P01', message: 'relation does not exist' } }).db, cfg, fetchImpl: f })
    expect(out).toMatchObject({ status: 'failed', detail: expect.stringContaining('13_whatsapp.sql') })
    expect(f).not.toHaveBeenCalled()
  })
  it('never throws, whatever goes wrong', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = { from: () => { throw new Error('db down') } } as never
    await expect(notify(input, { db: broken, cfg })).resolves.toMatchObject({ status: 'failed' })
  })
  it('passes the button link and the document through', async () => {
    const f = ok()
    await notify({ event: 'receipt_ready', phone: '9876543210', vars: EVENTS.receipt_ready.sample, fileUrl: 'https://x.test/r.pdf', pdfName: 'Receipt.pdf' }, { db: world().db, cfg, fetchImpl: f })
    const u = (f as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0]
    expect(u.searchParams.get('Fileurl')).toBe('https://x.test/r.pdf')
    expect(u.searchParams.get('PDFName')).toBe('Receipt.pdf')
    const g = ok()
    await notify({ event: 'tournament_registered', phone: '9876543210', vars: EVENTS.tournament_registered.sample, urlParam: 'abc' }, { db: world().db, cfg, fetchImpl: g })
    expect((g as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0].searchParams.get('URLParam')).toBe('abc')
  })
})

describe('retry and resend', () => {
  const failedRow = { id: 'n1', status: 'failed', attempts: 1, send_args: { contact: '919876543210', template: 't', params: ['a'] } }

  it('retries only clearly failed messages, a few times, and counts the sends', async () => {
    const db = fakeDb({ tables: { notification_log: (c: Call[]) => (has(c, 'update') ? {} : { data: [failedRow, { ...failedRow, id: 'n2' }] }) } })
    const out = await retryFailedNotifications({ db: db.db, cfg, fetchImpl: ok() })
    expect(out).toEqual({ retried: 2, sent: 2 })
    const query = db.log[0].calls
    expect(query).toContainEqual({ method: 'eq', args: ['status', 'failed'] })
    expect(query).toContainEqual({ method: 'lt', args: ['attempts', 3] })
    const updates = db.log.filter((e) => has(e.calls, 'update')).map((e) => arg(e.calls, 'update'))
    expect(updates[0]).toMatchObject({ status: 'sent', attempts: 2 })
  })
  it('does nothing without a configuration', async () => {
    expect(await retryFailedNotifications({ db: fakeDb().db, cfg: null })).toEqual({ retried: 0, sent: 0 })
  })
  it('resends one message for staff, but not one that already went out or was never prepared', async () => {
    const mk = (row: object | null) => fakeDb({ tables: { notification_log: (c: Call[]) => (has(c, 'update') ? {} : { data: row }) } }).db
    expect(await resend('n1', { db: mk(failedRow), cfg, fetchImpl: ok() })).toMatchObject({ status: 'sent' })
    await expect(resend('n1', { db: mk({ ...failedRow, status: 'sent' }), cfg })).rejects.toMatchObject({ status: 400 })
    await expect(resend('n1', { db: mk({ ...failedRow, send_args: null, status: 'skipped' }), cfg })).rejects.toMatchObject({ status: 400 })
    await expect(resend('n1', { db: mk(null), cfg })).rejects.toMatchObject({ status: 404 })
    await expect(resend('n1', { db: mk(failedRow), cfg: null })).rejects.toMatchObject({ status: 400 })
  })
})

describe('staff screens', () => {
  it('lists every message with the name currently in use, and flags missing setup', async () => {
    const db = fakeDb({ tables: { whatsapp_templates: { data: [{ event: 'match_call', template_name: 'match_call_v2', enabled: false }] }, notification_log: { data: [] } } })
    const s = await getAdminStatus({ db: db.db, cfg })
    expect(s.configured).toBe(true)
    expect(s.setup_complete).toBe(true)
    expect(s.templates).toHaveLength(EVENT_KEYS.length)
    expect(s.templates.find((t) => t.event === 'match_call')).toMatchObject({ template_name: 'match_call_v2', enabled: false })
    expect(s.templates.find((t) => t.event === 'booking_confirmed')).toMatchObject({ template_name: 'booking_confirmed', enabled: true })
    const missing = await getAdminStatus({ db: fakeDb({ tables: { notification_log: { error: { message: 'x' } } } }).db, cfg: null })
    expect(missing).toMatchObject({ configured: false, setup_complete: false, setup_hint: expect.stringContaining('13_whatsapp.sql') })
  })
  it('only checks the account when asked', async () => {
    const f = ok()
    const db = fakeDb({ tables: { whatsapp_templates: { data: [] }, notification_log: { data: [] } } }).db
    expect((await getAdminStatus({ db, cfg, fetchImpl: f })).account).toBeNull()
    expect(f).not.toHaveBeenCalled()
    expect((await getAdminStatus({ db, cfg, fetchImpl: f, check: true })).account).toMatchObject({ outcome: 'sent' })
  })
  it('validates template names and saves them', async () => {
    expect(() => templateUpdateSchema.parse({ template_name: 'Bad Name' })).toThrow()
    expect(() => templateUpdateSchema.parse({})).toThrow()
    expect(templateUpdateSchema.parse({ template_name: 'ok_name_1', enabled: false })).toEqual({ template_name: 'ok_name_1', enabled: false })
    const db = fakeDb({ tables: { whatsapp_templates: { data: { template_name: 'old', enabled: true } } } })
    await expect(updateTemplate('match_call', { enabled: false }, db.db)).resolves.toEqual({ message: 'Saved' })
    const saved = arg(db.log.find((e) => has(e.calls, 'upsert'))!.calls, 'upsert')
    expect(saved).toMatchObject({ event: 'match_call', template_name: 'old', enabled: false })
    await expect(updateTemplate('nope', { enabled: false }, db.db)).rejects.toMatchObject({ status: 404 })
  })
  it('sends a test with sample values and refuses what cannot be tested', async () => {
    const f = ok()
    const w = world()
    const out = await sendTest({ event: 'match_call', phone: '9876543210' }, 'staff1', { db: w.db, cfg, fetchImpl: f })
    expect(out.status).toBe('sent')
    const u = (f as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0]
    expect(u.searchParams.get('Param')).toBe('Rahul,NEO RIFT - EAFC SEASON 1')
    await expect(sendTest({ event: 'receipt_ready', phone: '9876543210' }, 's', { db: w.db, cfg })).rejects.toMatchObject({ status: 400 })
    await expect(sendTest({ event: 'match_call', phone: '123' }, 's', { db: w.db, cfg })).rejects.toMatchObject({ status: 400 })
    await expect(sendTest({ event: 'x', phone: '9876543210' }, 's', { db: w.db, cfg })).rejects.toMatchObject({ status: 404 })
    await expect(sendTest({ event: 'match_call', phone: '9876543210' }, 's', { db: w.db, cfg: null })).rejects.toMatchObject({ message: expect.stringContaining('not configured') })
    expect(() => testSendSchema.parse({ event: 'match_call', phone: '1' })).toThrow()
  })
  it('lists the log with filters and pages', async () => {
    const db = fakeDb({ tables: { notification_log: { data: [{ id: 'n1' }], count: 120 } } })
    const out = await listLog(logQuery.parse({ status: 'failed', event: 'match_call', page: '2' }), db.db)
    expect(out).toMatchObject({ total: 120, page: 2, limit: 50, data: [{ id: 'n1' }] })
    const calls = db.log[0].calls
    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'failed'] })
    expect(calls).toContainEqual({ method: 'range', args: [50, 99] })
  })
})
