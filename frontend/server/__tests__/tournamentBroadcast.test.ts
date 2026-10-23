import { describe, expect, it, vi } from 'vitest'
import { fakeDb, type Call } from './fakeDb'
import {
  MAX_RECIPIENTS, audienceEntrantIds, broadcastSchema, callMatchPlayers, continueBroadcast, previewBroadcast, previewQuery, startBroadcast,
} from '../services/tournamentBroadcast'

const cfg = { licenseNumber: 'L1', apiKey: 'K1', baseUrl: 'https://wa.test/api' }
const g = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const has = (c: Call[], m: string) => c.some((x) => x.method === m)
const callArg = (c: Call[], m: string, i = 0) => c.find((x) => x.method === m)?.args[i]
const okFetch = () => vi.fn(async () => new Response('{"status":"success"}')) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const urls = (f: unknown) => (f as { mock: { calls: [URL][] } }).mock.calls.map((c) => c[0])

/** An in-memory notification_log that understands the few queries the messenger makes. */
function logTable() {
  const rows: Record<string, any>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  const prefixOf = (calls: Call[]) => String(callArg(calls, 'like', 1) ?? '%').slice(0, -1).replace(/\\(.)/g, '$1')
  const resolver = (calls: Call[]) => {
    if (has(calls, 'insert')) {
      const row = callArg(calls, 'insert') as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!has(calls, 'select')) { rows.push({ id: `s${rows.length}`, ...row }); return {} }
      if (row.dedupe_key && rows.some((r) => r.dedupe_key === row.dedupe_key)) return { data: null, error: { code: '23505' } }
      const created = { id: `n${rows.length}`, attempts: 0, ...row }
      rows.push(created)
      return { data: created }
    }
    if (has(calls, 'update')) {
      const id = calls.find((c) => c.method === 'eq' && c.args[0] === 'id')?.args[1]
      Object.assign(rows.find((r) => r.id === id) ?? {}, callArg(calls, 'update'))
      return {}
    }
    const prefix = prefixOf(calls)
    const matching = rows.filter((r) => String(r.dedupe_key ?? '').startsWith(prefix))
    const pendingOnly = calls.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'pending')
    const sel = callArg(calls, 'select', 1) as { head?: boolean } | undefined
    if (sel?.head) return { count: matching.filter((r) => r.status === 'pending').length }
    if (pendingOnly) return { data: matching.filter((r) => r.status === 'pending').slice(0, Number(callArg(calls, 'limit') ?? 100)) }
    return { data: matching.map((r) => ({ status: r.status })) }
  }
  return { rows, resolver }
}

const profiles = (n: number) => Array.from({ length: n }, (_, i) => ({ user_id: `u${i + 1}`, full_name: `Player ${i + 1}`, username: `p${i + 1}`, phone: `9876543${String(i).padStart(3, '0')}` }))
const entrants = (n: number, over: (i: number) => object = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, user_id: `u${i + 1}`, team_id: null, display_name: `Player ${i + 1}`, status: 'registered', no_show: false, registered_at: String(i + 1), ...over(i) }))

function world(opts: { entrants?: object[]; profiles?: object[]; matches?: object[]; template?: object } = {}) {
  const log = logTable()
  const ent = opts.entrants ?? entrants(3)
  const f = fakeDb({
    tables: {
      tournament_overview: { data: { id: 't1', name: 'NEO RIFT' } },
      tournament_entrants: { data: ent },
      tournament_team_members: { data: [] },
      tournament_matches: { data: opts.matches ?? [] },
      user_profiles: { data: opts.profiles ?? profiles(ent.length) },
      whatsapp_templates: { data: opts.template ?? { template_name: 'tournament_update', enabled: true } },
      notification_log: log.resolver,
    },
  })
  return { ...f, log }
}

const body = { audience: 'registered' as const, message: 'Round of 64 starts at 11 AM', batch_id: g(1) }

describe('input', () => {
  it('needs a message of 1 to 200 characters and a batch id', () => {
    expect(() => broadcastSchema.parse({ ...body, message: '   ' })).toThrow()
    expect(() => broadcastSchema.parse({ ...body, message: 'x'.repeat(201) })).toThrow()
    expect(() => broadcastSchema.parse({ ...body, batch_id: 'nope' })).toThrow()
    expect(broadcastSchema.parse({ ...body, message: '  hi  ' }).message).toBe('hi')
  })
  it('a round audience needs a round', () => {
    expect(() => broadcastSchema.parse({ ...body, audience: 'round' })).toThrow()
    expect(() => previewQuery.parse({ audience: 'round' })).toThrow()
    expect(previewQuery.parse({ audience: 'round', round: '2' })).toEqual({ audience: 'round', round: 2 })
  })
})

describe('audiences', () => {
  const rows = [
    { id: 'a', status: 'registered', no_show: false }, { id: 'b', status: 'checked_in', no_show: false }, { id: 'c', status: 'waitlist', no_show: false },
    { id: 'd', status: 'registered', no_show: true }, { id: 'e', status: 'withdrawn', no_show: false }, { id: 'f', status: 'disqualified', no_show: true },
  ]
  const ids = (audience: Parameters<typeof audienceEntrantIds>[2]) => audienceEntrantIds(world({ entrants: rows }).db, 't1', audience)
  it('picks the right people', async () => {
    expect(await ids('registered')).toEqual(['a', 'b', 'd'])
    expect(await ids('checked_in')).toEqual(['b'])
    expect(await ids('waitlist')).toEqual(['c'])
    expect(await ids('no_show')).toEqual(['d']) // a disqualified no-show is not in the tournament any more
  })
  it('"round" means players who still have to play in that round', async () => {
    const matches = [
      { entrant1_id: 'a', entrant2_id: 'b', status: 'ready' }, { entrant1_id: 'c', entrant2_id: 'd', status: 'completed' },
      { entrant1_id: 'e', entrant2_id: null, status: 'bye' }, { entrant1_id: 'f', entrant2_id: null, status: 'pending' },
    ]
    expect((await audienceEntrantIds(world({ matches }).db, 't1', 'round', 1)).sort()).toEqual(['a', 'b', 'f'])
  })
  it('previews how many people will get it, how many cannot, and a few names', async () => {
    const p = profiles(3)
    p[2] = { ...p[2], phone: '12345' }
    const out = await previewBroadcast('t1', { audience: 'registered' }, world({ profiles: p }).db)
    expect(out).toMatchObject({ entrants: 3, people: 3, with_number: 2, without_number: 1, sample: ['Player 1', 'Player 2', 'Player 3'] })
  })
})

describe('startBroadcast and continueBroadcast', () => {
  it('prepares everyone, sends the first batch, and reports what is left', async () => {
    const w = world({ entrants: entrants(30) })
    const f = okFetch()
    const out = await startBroadcast('t1', broadcastSchema.parse(body), 'staff1', w.db, { cfg, fetchImpl: f })
    expect(out).toMatchObject({ people: 30, sent: 12, remaining: 18, totals: { pending: 18, sent: 12 } })
    const u = urls(f)[0]
    expect(u.searchParams.get('Template')).toBe('tournament_update')
    expect(u.searchParams.get('Param')).toBe('Player 1,NEO RIFT,Round of 64 starts at 11 AM')
    expect(u.searchParams.get('URLParam')).toBe('t1')
  })
  it('keeps going until nobody is waiting, and counts it all', async () => {
    const w = world({ entrants: entrants(30) })
    const f = okFetch()
    const deps = { cfg, fetchImpl: f }
    let last: Pick<Awaited<ReturnType<typeof continueBroadcast>>, 'remaining' | 'totals'> = await startBroadcast('t1', broadcastSchema.parse(body), 'staff1', w.db, deps)
    let rounds = 0
    while (last.remaining > 0 && rounds++ < 10) last = await continueBroadcast('t1', g(1), w.db, deps)
    expect(last.totals).toMatchObject({ sent: 30, pending: 0, failed: 0 })
    expect(f).toHaveBeenCalledTimes(30)
  })
  it('pressing the button twice (same batch) sends nothing twice', async () => {
    const w = world()
    const f = okFetch()
    const deps = { cfg, fetchImpl: f }
    await startBroadcast('t1', broadcastSchema.parse(body), 'staff1', w.db, deps)
    const again = await startBroadcast('t1', broadcastSchema.parse(body), 'staff1', w.db, deps)
    expect(f).toHaveBeenCalledTimes(3)
    expect(again.totals).toMatchObject({ sent: 3, pending: 0 })
    // a new batch id is a deliberate new send
    await startBroadcast('t1', broadcastSchema.parse({ ...body, batch_id: g(2) }), 'staff1', w.db, deps)
    expect(f).toHaveBeenCalledTimes(6)
  })
  it('shows who could not be reached instead of failing', async () => {
    const p = profiles(3)
    p[1] = { ...p[1], phone: null as unknown as string }
    const w = world({ profiles: p })
    const out = await startBroadcast('t1', broadcastSchema.parse(body), 'staff1', w.db, { cfg, fetchImpl: okFetch() })
    expect(out.totals).toMatchObject({ sent: 2, skipped: 0 }) // the skipped note is logged without the batch key
    expect(out.people).toBe(3)
  })
  it('refuses an empty group and an enormous one', async () => {
    await expect(startBroadcast('t1', broadcastSchema.parse({ ...body, audience: 'waitlist' }), 's', world().db, { cfg })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Nobody') })
    const big = world({ entrants: entrants(MAX_RECIPIENTS + 1) })
    await expect(startBroadcast('t1', broadcastSchema.parse(body), 's', big.db, { cfg })).rejects.toMatchObject({ status: 400, message: expect.stringContaining(String(MAX_RECIPIENTS)) })
  })
  it('needs WhatsApp configured to send', async () => {
    await expect(startBroadcast('t1', broadcastSchema.parse(body), 's', world().db, { cfg: null })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('not configured') })
  })
  it('records the staff member who sent it', async () => {
    const w = world()
    await startBroadcast('t1', broadcastSchema.parse(body), 'staff-42', w.db, { cfg, fetchImpl: okFetch() })
    expect(w.log.rows.every((r) => r.sent_by === 'staff-42')).toBe(true)
  })
})

describe('callMatchPlayers', () => {
  const match = { id: 'm1', tournament_id: 't1', status: 'ready', entrant1_id: 'e1', entrant2_id: 'e2' }
  const mk = (m: object | null, ent = entrants(2)) => {
    const w = world({ entrants: ent })
    const db = fakeDb({
      tables: {
        tournament_matches: { data: m },
        tournament_overview: { data: { id: 't1', name: 'NEO RIFT' } },
        tournament_entrants: { data: ent },
        tournament_team_members: { data: [] },
        user_profiles: { data: profiles(2) },
        whatsapp_templates: { data: { template_name: 'match_call', enabled: true } },
        notification_log: w.log.resolver,
      },
    })
    return { ...db, log: w.log }
  }
  it('messages both players', async () => {
    const f = okFetch()
    const w = mk(match)
    const out = await callMatchPlayers('m1', 'staff1', w.db, { cfg, fetchImpl: f })
    expect(out.called.map((c) => c.status)).toEqual(['sent', 'sent'])
    expect(urls(f).map((u) => u.searchParams.get('Param'))).toEqual(['Player 1,NEO RIFT', 'Player 2,NEO RIFT'])
  })
  it('does not call again within 5 minutes', async () => {
    const f = okFetch()
    const w = mk(match)
    await callMatchPlayers('m1', 'staff1', w.db, { cfg, fetchImpl: f })
    const again = await callMatchPlayers('m1', 'staff1', w.db, { cfg, fetchImpl: f })
    expect(again.called.map((c) => c.status)).toEqual(['duplicate', 'duplicate'])
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('calls the one player who is known', async () => {
    const f = okFetch()
    const out = await callMatchPlayers('m1', 's', mk({ ...match, entrant2_id: null }).db, { cfg, fetchImpl: f })
    expect(out.called).toHaveLength(1)
  })
  it('refuses a finished match, an empty match, an unknown match, and players without numbers', async () => {
    await expect(callMatchPlayers('m1', 's', mk({ ...match, status: 'completed' }).db, { cfg })).rejects.toMatchObject({ status: 400 })
    await expect(callMatchPlayers('m1', 's', mk({ ...match, entrant1_id: null, entrant2_id: null }).db, { cfg })).rejects.toMatchObject({ status: 400 })
    await expect(callMatchPlayers('m1', 's', mk(null).db, { cfg })).rejects.toMatchObject({ status: 404 })
    const walkIns = entrants(2, () => ({ user_id: null }))
    await expect(callMatchPlayers('m1', 's', mk(match, walkIns).db, { cfg })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('no WhatsApp number') })
  })
})
