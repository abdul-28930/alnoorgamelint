import { describe, expect, it, vi } from 'vitest'
import { fakeDb, type Call } from './fakeDb'
import { formatStart, notifyEntrants } from '../services/tournamentNotifications'

const cfg = { licenseNumber: 'L1', apiKey: 'K1', baseUrl: 'https://wa.test/api' }
const has = (c: Call[], m: string) => c.some((x) => x.method === m)
const T = { id: 't1', name: 'NEO RIFT - EAFC SEASON 1', starts_at: '2026-10-31T05:30:00Z' } // 11:00 AM IST
const urls = (f: unknown) => (f as { mock: { calls: [URL][] } }).mock.calls.map((c) => c[0])
const okFetch = () => vi.fn(async () => new Response('{"status":"success"}')) as unknown as typeof fetch

const world = (entrants: object[], members: object[] = [], profiles: object[] = []) =>
  fakeDb({
    tables: {
      tournament_overview: { data: T },
      tournament_entrants: { data: entrants },
      tournament_team_members: { data: members },
      user_profiles: { data: profiles },
      whatsapp_templates: { data: { template_name: 'tournament_registered', enabled: true } },
      notification_log: (c: Call[]) => (has(c, 'insert') && has(c, 'select') ? { data: { id: 'n1', attempts: 0 } } : {}),
    },
  })

const rahul = { user_id: 'u1', full_name: 'Rahul', username: 'rahul', phone: '98765 43210' }

describe('formatStart', () => {
  it('writes the start in IST, the way a person would', () => {
    expect(formatStart('2026-10-31T05:30:00Z')).toBe('31 Oct 2026 11:00 AM')
    expect(formatStart('2026-11-01T08:05:00Z')).toBe('1 Nov 2026 1:35 PM')
    expect(formatStart('2026-10-31T18:30:00Z')).toBe('1 Nov 2026 12:00 AM') // IST midnight
    expect(formatStart(null)).toBe('To be announced')
    expect(formatStart('nonsense')).toBe('To be announced')
  })
})

describe('notifyEntrants', () => {
  it('tells a registered player, with the tournament, status, start and a link to the tournament', async () => {
    const f = okFetch()
    const w = world([{ id: 'e1', user_id: 'u1', team_id: null, display_name: 'Rahul', status: 'registered', registered_at: '1' }], [], [rahul])
    const out = await notifyEntrants(w.db, 't1', ['e1'], 'registered', { cfg, fetchImpl: f })
    expect(out.map((o) => o.status)).toEqual(['sent'])
    const u = urls(f)[0]
    expect(u.searchParams.get('Contact')).toBe('919876543210')
    expect(u.searchParams.get('Param')).toBe('Rahul,NEO RIFT - EAFC SEASON 1,Registered,31 Oct 2026 11:00 AM')
    expect(u.searchParams.get('URLParam')).toBe('t1')
    const inserted = w.log.find((e) => e.table === 'notification_log' && has(e.calls, 'insert'))!.calls.find((c) => c.method === 'insert')!.args[0]
    expect(inserted).toMatchObject({ event: 'tournament_registered', dedupe_key: 'tournament:t1:e1:u1:registered', tournament_id: 't1', entrant_id: 'e1' })
  })
  it('tells a waiting player their number, counted from the oldest sign-up', async () => {
    const f = okFetch()
    const rows = [
      { id: 'w1', user_id: 'u9', team_id: null, display_name: 'First', status: 'waitlist', registered_at: '2026-10-01T10:00:00Z' },
      { id: 'w2', user_id: 'u1', team_id: null, display_name: 'Rahul', status: 'waitlist', registered_at: '2026-10-02T10:00:00Z' },
    ]
    await notifyEntrants(world(rows, [], [rahul]).db, 't1', ['w2'], 'registered', { cfg, fetchImpl: f })
    expect(urls(f)[0].searchParams.get('Param')).toContain('Waitlist number 2')
  })
  it('uses the waitlist-moved-up message when a place opens', async () => {
    const f = okFetch()
    const w = world([{ id: 'e1', user_id: 'u1', team_id: null, display_name: 'Rahul', status: 'registered', registered_at: '1' }], [], [rahul])
    await notifyEntrants(w.db, 't1', ['e1'], 'moved_up', { cfg, fetchImpl: f })
    expect(urls(f)[0].searchParams.get('Param')).toBe('Rahul,NEO RIFT - EAFC SEASON 1')
    const inserted = w.log.find((e) => e.table === 'notification_log' && has(e.calls, 'insert'))!.calls.find((c) => c.method === 'insert')!.args[0]
    expect(inserted).toMatchObject({ event: 'tournament_waitlist_moved_up', dedupe_key: 'tournament:t1:e1:u1:moved_up' })
  })
  it('tells every accepted member of a team, each with their own number', async () => {
    const f = okFetch()
    const w = world(
      [{ id: 'e1', user_id: null, team_id: 'tm1', display_name: 'Reds', status: 'registered', registered_at: '1' }],
      [{ team_id: 'tm1', user_id: 'u1' }, { team_id: 'tm1', user_id: 'u2' }],
      [rahul, { user_id: 'u2', full_name: 'Arjun', username: 'arjun', phone: '9123456789' }],
    )
    const out = await notifyEntrants(w.db, 't1', ['e1'], 'registered', { cfg, fetchImpl: f })
    expect(out).toHaveLength(2)
    expect(urls(f).map((u) => u.searchParams.get('Contact')).sort()).toEqual(['919123456789', '919876543210'])
  })
  it('says nothing for a walk-in added by name (there is no number)', async () => {
    const f = okFetch()
    const w = world([{ id: 'e1', user_id: null, team_id: null, display_name: 'Walk-in', status: 'registered', registered_at: '1' }])
    expect(await notifyEntrants(w.db, 't1', ['e1'], 'registered', { cfg, fetchImpl: f })).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
  it('does nothing, and asks the database nothing, when WhatsApp is not configured', async () => {
    const w = world([])
    expect(await notifyEntrants(w.db, 't1', ['e1'], 'registered', { cfg: null })).toEqual([])
    expect(await notifyEntrants(w.db, 't1', [], 'registered', { cfg })).toEqual([])
    expect(w.log).toHaveLength(0)
  })
  it('never throws when the database misbehaves', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = { from: () => { throw new Error('db down') } } as never
    await expect(notifyEntrants(broken, 't1', ['e1'], 'registered', { cfg })).resolves.toEqual([])
  })
})
