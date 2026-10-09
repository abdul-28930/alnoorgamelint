import { describe, expect, it, vi } from 'vitest'
import { fakeDb, rpcArgs } from './fakeDb'
import { reminderHtml } from '../mailer'
import { flagsToSet, MAX_REMINDERS_PER_RUN, runCron } from '../services/reminders'

const due = (id: string, user: string, kind: string, start = '2030-01-01 10:20:00') => ({ id, user_id: user, start_at: start, kind, station_name: 'Corpo PC' })
const now = new Date('2030-01-01T04:30:00Z') // 10:00 IST

const setup = (rows: ReturnType<typeof due>[], users: Record<string, string | null>) =>
  fakeDb({ rpcs: { refresh_booking_statuses: { data: { started: 2, ended: 1 } }, due_reminders: { data: rows } }, users })

const updates = (log: ReturnType<typeof fakeDb>['log']) =>
  log.filter((e) => e.table === 'bookings').map((e) => ({
    set: e.calls.find((c) => c.method === 'update')!.args[0],
    ids: e.calls.find((c) => c.method === 'in')!.args[1],
  }))

describe('flagsToSet', () => {
  it('a closer reminder retires the wider ones', () => {
    expect(flagsToSet('1h')).toEqual({ reminder_1h_sent: true })
    expect(Object.keys(flagsToSet('30m')).sort()).toEqual(['reminder_1h_sent', 'reminder_30m_sent'])
    expect(Object.keys(flagsToSet('5m'))).toHaveLength(3)
  })
})

describe('runCron', () => {
  it('refreshes statuses with the IST clock, emails each due booking and marks only sent ones', async () => {
    const { db, log } = setup([due('b1', 'u1', '30m'), due('b2', 'u1', '5m'), due('b3', 'u2', '1h')], { u1: 'a@x.com', u2: 'b@x.com' })
    const send = vi.fn().mockResolvedValue({ sent: true })
    const out = await runCron({ db, now, smtpConfigured: true, send })

    expect(rpcArgs(log, 'refresh_booking_statuses')).toEqual({ p_now: '2030-01-01 10:00:00' })
    expect(rpcArgs(log, 'due_reminders')).toEqual({ p_now: '2030-01-01 10:00:00', p_limit: MAX_REMINDERS_PER_RUN })
    expect(out).toEqual({ statuses: { started: 2, ended: 1 }, reminders: { due: 3, sent: 3, failed: 0, no_email: 0 } })
    expect(send).toHaveBeenCalledWith('a@x.com', '30m', { station_name: 'Corpo PC', start_time: '10:20' })
    expect(updates(log)).toEqual(expect.arrayContaining([
      { set: flagsToSet('30m'), ids: ['b1'] }, { set: flagsToSet('5m'), ids: ['b2'] }, { set: flagsToSet('1h'), ids: ['b3'] },
    ]))
  })
  it('looks each user up once per run', async () => {
    const f = setup([due('b1', 'u1', '30m'), due('b2', 'u1', '5m')], { u1: 'a@x.com' })
    await runCron({ db: f.db, now, smtpConfigured: true, send: vi.fn().mockResolvedValue({ sent: true }) })
    expect(f.lookups).toEqual(['u1'])
  })
  it('does NOT mark a reminder sent when the email failed (the old job did), so the next run retries it', async () => {
    const { db, log } = setup([due('b1', 'u1', '30m'), due('b2', 'u2', '30m')], { u1: 'a@x.com', u2: 'b@x.com' })
    const send = vi.fn().mockImplementation(async (to: string) => (to === 'a@x.com' ? { sent: false, reason: 'SMTP error' } : { sent: true }))
    const out = await runCron({ db, now, smtpConfigured: true, send })
    expect(out.reminders).toMatchObject({ due: 2, sent: 1, failed: 1 })
    expect(updates(log)).toEqual([{ set: flagsToSet('30m'), ids: ['b2'] }])
  })
  it('counts users without an email and unexpected errors, and keeps going', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, log } = setup([due('b1', 'ghost', '5m'), due('b2', 'u1', '5m'), due('b3', 'u2', '5m')], { u1: 'a@x.com', u2: 'b@x.com' })
    const send = vi.fn().mockImplementation(async (to: string) => { if (to === 'a@x.com') throw new Error('boom'); return { sent: true } })
    const out = await runCron({ db, now, smtpConfigured: true, send })
    expect(out.reminders).toEqual({ due: 3, sent: 1, failed: 1, no_email: 1 })
    expect(updates(log)).toEqual([{ set: flagsToSet('5m'), ids: ['b3'] }])
  })
  it('without SMTP it still refreshes statuses but sends and marks nothing', async () => {
    const { db, log } = setup([due('b1', 'u1', '5m')], { u1: 'a@x.com' })
    const out = await runCron({ db, now, smtpConfigured: false })
    expect(out.reminders).toEqual({ due: 0, sent: 0, failed: 0, no_email: 0, skipped: 'SMTP not configured' })
    expect(rpcArgs(log, 'due_reminders')).toBeUndefined()
    expect(out.statuses).toEqual({ started: 2, ended: 1 })
  })
  it('fails loudly if the database functions are missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb({ rpcs: { refresh_booking_statuses: { error: { message: 'function does not exist' } } } })
    await expect(runCron({ db, now, smtpConfigured: true })).rejects.toMatchObject({ status: 500 })
  })
})

describe('reminderHtml', () => {
  it('names the window and escapes the station name', () => {
    const html = reminderHtml('30m', { station_name: '<b>PC</b>', start_time: '10:20' })
    expect(html).toContain('Session in 30 minutes')
    expect(html).toContain('&lt;b&gt;PC&lt;/b&gt;')
    expect(html).not.toContain('<b>PC</b>')
  })
})
