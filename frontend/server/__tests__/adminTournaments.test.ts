import { describe, expect, it, vi } from 'vitest'
import { fakeDb, rpcArgs, type Call } from './fakeDb'
import {
  addEntrant, addEntrantSchema, bracketSchema, deleteTournament, findForfeit, getTournamentDetail, matchUpdateSchema, previewBracket,
  removeEntrant, reportResult, resultSchema, settleForfeits, setTournamentStatus, startBracket, tournamentSchema, tournamentUpdateSchema,
  undoResult, updateEntrant, updateEntrantSchema, updateMatch, updateTournament,
} from '../services/admin/tournaments'

const T = {
  id: 't1', name: 'Cup', status: 'open', tournament_type: 'knockout', max_players: 4, registered_count: 2, waitlist_count: 0,
  started_at: null, entry_fee: 0, best_of: 3, third_place_match: true, double_round_robin: false, seeding: 'random',
  team_size: 1, champion_entrant_id: null,
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const has = (calls: Call[], m: string) => calls.some((c) => c.method === m)
const argOf = (calls: Call[], m: string) => calls.find((c) => c.method === m)?.args[0]

describe('tournament settings', () => {
  const base = { name: 'Cup', game: 'FIFA', platform: 'PS5', max_players: 8, tournament_type: 'knockout' }
  it('fills sensible defaults and converts datetime-local values from IST', () => {
    const t = tournamentSchema.parse({ ...base, starts_at: '2030-01-01T18:30' })
    expect(t).toMatchObject({ team_size: 1, best_of: 1, seeding: 'random', entry_fee: 0, prize_pool: 0, third_place_match: false, description: '' })
    expect(t.starts_at).toBe('2030-01-01T13:00:00.000Z') // 18:30 IST
    expect(tournamentSchema.parse({ ...base, starts_at: '2030-01-01T10:00:00Z' }).starts_at).toBe('2030-01-01T10:00:00.000Z')
    expect(tournamentSchema.parse({ ...base, starts_at: null }).starts_at).toBeNull()
  })
  it('rejects bad values', () => {
    for (const bad of [{ max_players: 1 }, { max_players: 999 }, { platform: 'XBOX' }, { best_of: 2 }, { team_size: 0 }, { entry_fee: -1 }, { starts_at: 'soon' }, { tournament_type: 'swiss' }]) {
      expect(() => tournamentSchema.parse({ ...base, ...bad })).toThrow()
    }
  })
  it('update is partial', () => {
    expect(tournamentUpdateSchema.parse({ name: 'New' })).toEqual({ name: 'New' })
  })

  const run = async (current: object, input: object) => {
    const { db, log } = fakeDb({ tables: { tournament_overview: { data: { ...T, ...current } }, tournaments: { data: { id: 't1' } } } })
    const out = await updateTournament('t1', tournamentUpdateSchema.parse(input), db)
    return { out, log }
  }
  it('lets everything change before the bracket exists, and only cosmetics after', async () => {
    await expect(run({}, { tournament_type: 'league', best_of: 5 })).resolves.toBeTruthy()
    await expect(run({ status: 'active', started_at: 'x' }, { name: 'Renamed', prize_pool: 500 })).resolves.toBeTruthy()
    await expect(run({ status: 'active', started_at: 'x' }, { tournament_type: 'league' })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('tournament_type') })
    await expect(run({ status: 'active', started_at: 'x' }, { best_of: 3 })).resolves.toBeTruthy() // unchanged value is fine
  })
  it('takes an expected end time and refuses one before the start', async () => {
    const ok = await run({ starts_at: '2026-11-14T05:30:00Z' }, { ends_at: '2026-11-14T18:00' }) // 6:00 PM IST
    expect(ok.log.find((e) => e.table === 'tournaments')!.calls.find((c) => c.method === 'update')!.args[0]).toEqual({ ends_at: '2026-11-14T12:30:00.000Z' })
    await expect(run({ starts_at: '2026-11-14T05:30:00Z' }, { ends_at: '2026-11-14T10:00' })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('after the start') })
    await expect(run({ ends_at: '2026-11-14T12:30:00Z' }, { starts_at: '2026-11-14T20:00' })).rejects.toMatchObject({ status: 400 }) // moving the start past the end
    await expect(run({}, { ends_at: null })).resolves.toBeTruthy() // clearing it is fine
  })
  it('will not drop the limit below the players already in', async () => {
    await expect(run({ registered_count: 6 }, { max_players: 4 })).rejects.toMatchObject({ status: 400 })
    await expect(run({}, {})).rejects.toMatchObject({ message: 'Nothing to update' })
  })
})

describe('status changes', () => {
  const status = (current: object, to: string) =>
    setTournamentStatus('t1', to, fakeDb({ tables: { tournament_overview: { data: { ...T, ...current } }, tournaments: {} } }).db)
  it('allows the sensible moves', async () => {
    await expect(status({ status: 'draft' }, 'open')).resolves.toBeTruthy()
    await expect(status({ status: 'open' }, 'paused')).resolves.toBeTruthy()
    await expect(status({ status: 'active', started_at: 'x' }, 'paused')).resolves.toBeTruthy()
    await expect(status({ status: 'paused', started_at: 'x' }, 'active')).resolves.toBeTruthy()
  })
  it('refuses starting or finishing by hand, and moves that make no sense', async () => {
    await expect(status({ status: 'open' }, 'active')).rejects.toMatchObject({ message: expect.stringContaining('bracket is generated') })
    await expect(status({ status: 'active', started_at: 'x' }, 'completed')).rejects.toMatchObject({ status: 400 })
    await expect(status({ status: 'completed' }, 'open')).rejects.toMatchObject({ status: 400 })
    await expect(status({ status: 'paused' }, 'active')).rejects.toMatchObject({ message: 'Generate the bracket to start the tournament' })
    await expect(status({ status: 'paused', started_at: 'x' }, 'open')).rejects.toMatchObject({ message: expect.stringContaining('cannot reopen') })
  })
  it('does not delete a running tournament', async () => {
    await expect(deleteTournament('t1', fakeDb({ tables: { tournament_overview: { data: { ...T, status: 'active' } } } }).db)).rejects.toMatchObject({ status: 400 })
    await expect(deleteTournament('t1', fakeDb({ tables: { tournament_overview: { data: { ...T, status: 'draft' } }, tournaments: {} } }).db)).resolves.toEqual({ message: 'Tournament deleted' })
  })
})

describe('entrants', () => {
  it('registers players and puts the overflow on the waitlist', async () => {
    const add = (t: object, input: object, extra: object = {}) => {
      const f = fakeDb({ tables: {
        tournament_overview: { data: { ...T, ...t } },
        tournament_entrants: (calls) => (calls.some((c) => c.method === 'insert') ? { data: { id: 'e1' }, ...extra } : { data: null }),
        user_profiles: { data: { user_id: 'u1', username: 'ann', full_name: 'Ann Lee' } },
      } })
      return addEntrant('t1', addEntrantSchema.parse(input), f.db).then(() => f.log)
    }
    const inserted = (log: ReturnType<typeof fakeDb>['log']) => argOf(log.find((e) => e.table === 'tournament_entrants' && e.calls.some((c) => c.method === 'insert'))!.calls, 'insert') as Record<string, unknown>

    expect(inserted(await add({ registered_count: 2 }, { display_name: 'Walk-in Raj', phone: '98765 43210', email: 'Raj@Example.com' }))).toMatchObject({ display_name: 'Walk-in Raj', phone: '9876543210', email: 'raj@example.com', whatsapp_opt_in: true, status: 'registered', payment_status: 'NOT_REQUIRED', user_id: null })
    expect(inserted(await add({ registered_count: 4 }, { display_name: 'Late', phone: '9876543211' }))).toMatchObject({ status: 'waitlist' })
    expect(inserted(await add({ entry_fee: 100 }, { display_name: 'Payer', phone: '9876543212' }))).toMatchObject({ payment_status: 'PENDING' })
    const byUser = await add({}, { username: 'ann' })
    expect(inserted(byUser)).toMatchObject({ user_id: 'u1', display_name: 'Ann Lee' })
    expect(byUser.find((e) => e.table === 'user_profiles')!.calls).toContainEqual({ method: 'ilike', args: ['username', 'ann'] })
    expect(() => addEntrantSchema.parse({})).toThrow()
    expect(() => addEntrantSchema.parse({ display_name: 'No phone' })).toThrow(/phone/i)
    expect(() => addEntrantSchema.parse({ display_name: 'Bad mail', phone: '9876543210', email: 'nope' })).toThrow()
  })
  it('refuses a phone number or email that is already registered, and a bad number', async () => {
    const f = (taken: object | null) => fakeDb({ tables: { tournament_overview: { data: T }, tournament_entrants: (c) => (c.some((x) => x.method === 'insert') ? { data: { id: 'e1' } } : { data: taken }) } }).db
    await expect(addEntrant('t1', addEntrantSchema.parse({ display_name: 'Dup', phone: '9876543210' }), f({ id: 'x', display_name: 'Rahul' })))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('already registered in this tournament as Rahul') })
    await expect(addEntrant('t1', addEntrantSchema.parse({ display_name: 'Short', phone: '12345' }), f(null))).rejects.toMatchObject({ status: 400, message: expect.stringContaining('10-digit') })
  })
  it('explains duplicates, unknown usernames and late additions', async () => {
    const f = (over: object = {}, entrants: object = { data: { id: 'e' } }, profile: object = { data: { user_id: 'u', username: 'a' } }) =>
      fakeDb({ tables: { tournament_overview: { data: { ...T, ...over } }, tournament_entrants: entrants, user_profiles: profile } }).db
    await expect(addEntrant('t1', { username: 'ann' }, f({}, { error: { code: '23505' } }))).rejects.toMatchObject({ message: 'That player is already registered' })
    await expect(addEntrant('t1', { username: 'nobody' }, f({}, {}, { data: null }))).rejects.toMatchObject({ status: 404 })
    await expect(addEntrant('t1', { display_name: 'x', phone: '9876543210' }, f({ status: 'active', started_at: 'x' }))).rejects.toMatchObject({ status: 400 })
  })

  it('adds a specific member picked from the search, on the waitlist even when there is room, and after the bracket exists', async () => {
    const mk = (over: object = {}) => fakeDb({ tables: {
      tournament_overview: { data: { ...T, ...over } },
      tournament_entrants: (c) => (c.some((x) => x.method === 'insert') ? { data: { id: 'e1' } } : { data: null }),
      user_profiles: { data: { user_id: 'u1', username: 'ann', full_name: 'Ann Lee' } },
    } })
    const U = '00000000-0000-4000-8000-000000000001'
    const insertOf = (f: ReturnType<typeof mk>) => argOf(f.log.find((e) => e.table === 'tournament_entrants' && e.calls.some((c) => c.method === 'insert'))!.calls, 'insert') as Record<string, unknown>

    const room = mk({ registered_count: 1 })
    await addEntrant('t1', addEntrantSchema.parse({ user_id: U, to_waitlist: true }), room.db)
    expect(insertOf(room)).toMatchObject({ user_id: 'u1', display_name: 'Ann Lee', status: 'waitlist' })
    expect(room.log.find((e) => e.table === 'user_profiles')!.calls).toContainEqual({ method: 'eq', args: ['user_id', U] })

    const normal = mk({ registered_count: 1 })
    await addEntrant('t1', addEntrantSchema.parse({ user_id: U }), normal.db)
    expect(insertOf(normal)).toMatchObject({ status: 'registered' })

    const started = mk({ started_at: 'x', status: 'active', registered_count: 4 })
    await addEntrant('t1', addEntrantSchema.parse({ user_id: U, to_waitlist: true }), started.db)
    expect(insertOf(started)).toMatchObject({ status: 'waitlist' })
    await expect(addEntrant('t1', addEntrantSchema.parse({ user_id: U }), mk({ started_at: 'x', status: 'active' }).db)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('waitlist') })
  })

  const entrantRow = { id: 'e1', tournament_id: 't1', status: 'registered' }
  const upd = (t: object, entrant: object, input: object, extra: Record<string, unknown> = {}) => {
    const f = fakeDb({ tables: {
      tournament_overview: { data: { ...T, ...t } },
      tournament_entrants: (calls) => has(calls, 'update') ? { data: { id: 'e1' } } : has(calls, 'order') ? { data: [{ id: 'w1' }] } : { data: { ...entrantRow, ...entrant } },
      tournament_matches: { data: [] },
      ...extra,
    } })
    return updateEntrant('t1', 'e1', updateEntrantSchema.parse(input), f.db).then(() => f.log)
  }
  it('checks capacity when someone is brought back in', async () => {
    await expect(upd({ registered_count: 4 }, { status: 'waitlist' }, { status: 'registered' })).rejects.toMatchObject({ message: 'The tournament is full' })
    await expect(upd({ registered_count: 3 }, { status: 'waitlist' }, { status: 'checked_in' })).resolves.toBeTruthy()
    await expect(upd({}, {}, { payment_status: 'PAID' })).resolves.toBeTruthy()
  })
  it('after the bracket exists an entrant can only leave or be disqualified, and seeds are frozen', async () => {
    const started = { status: 'active', started_at: 'x' }
    await expect(upd(started, {}, { status: 'waitlist' })).rejects.toMatchObject({ message: expect.stringContaining('withdraw or be disqualified') })
    await expect(upd(started, {}, { seed: 1 })).rejects.toMatchObject({ message: expect.stringContaining('Seeds') })
    await expect(upd(started, {}, { payment_status: 'PAID' })).resolves.toBeTruthy()
    await expect(upd(started, {}, { status: 'disqualified' })).resolves.toBeTruthy()
  })
  it('promotes the next waitlisted player when someone withdraws before the start', async () => {
    const log = await upd({ registered_count: 1, waitlist_count: 1, max_players: 2 }, {}, { status: 'withdrawn' })
    const promote = log.filter((e) => e.table === 'tournament_entrants').flatMap((e) => e.calls).filter((c) => c.method === 'update').map((c) => c.args[0])
    expect(promote).toContainEqual({ status: 'registered' })
  })
  it('removes entrants only before the start', async () => {
    const mk = (t: object) => fakeDb({ tables: { tournament_overview: { data: { ...T, ...t } }, tournament_entrants: { data: { id: 'e1' } } } }).db
    await expect(removeEntrant('t1', 'e1', mk({}))).resolves.toEqual({ message: 'Entrant removed' })
    await expect(removeEntrant('t1', 'e1', mk({ status: 'active', started_at: 'x' }))).rejects.toMatchObject({ status: 400 })
  })
})

describe('forfeits', () => {
  const m = (idn: string, round: number, position: number, a: string | null, b: string | null) => ({ id: idn, round, position, entrant1_id: a, entrant2_id: b })
  it('awards a match to the opponent of a player who is out, earliest match first', () => {
    const out = new Map([['x', 3]])
    expect(findForfeit([m('late', 2, 1, 'x', 'y'), m('early', 1, 1, 'a', 'x')], out)).toEqual({ matchId: 'early', winnerId: 'a' })
    expect(findForfeit([m('m', 1, 1, 'x', 'y')], out)).toEqual({ matchId: 'm', winnerId: 'y' })
  })
  it('gives the match to the better seed when both are out, and ignores unfilled or unaffected matches', () => {
    const out = new Map<string, number | null>([['x', 4], ['y', 2]])
    expect(findForfeit([m('m', 1, 1, 'x', 'y')], out)).toEqual({ matchId: 'm', winnerId: 'y' })
    expect(findForfeit([m('p', 1, 1, 'x', null), m('q', 1, 2, 'a', 'b')], out)).toBeNull()
    expect(findForfeit([], out)).toBeNull()
  })
  it('settles every affected match, one at a time, until nothing is left', async () => {
    let round = 0
    const f = fakeDb({
      tables: {
        tournament_overview: { data: { ...T, status: 'active', started_at: 'x' } },
        tournament_entrants: { data: [{ id: 'x', seed: 3 }] },
        // first look: x is due to play in two matches; after the first is settled only one is left; then none
        tournament_matches: () => ({ data: [[m('m1', 1, 1, 'a', 'x'), m('m2', 2, 1, 'x', 'b')], [m('m2', 2, 1, 'x', 'b')], []][round++] }),
      },
      rpcs: { report_match_result: { data: { tournament_completed: false } } },
    })
    const out = await settleForfeits(f.db, 't1')
    expect(out).toEqual({ settled: 2, completed: false })
    const calls = f.log.filter((e) => e.rpc === 'report_match_result').map((e) => e.calls[0].args[0])
    expect(calls).toEqual([
      { p_match_id: 'm1', p_score1: null, p_score2: null, p_winner: 'a', p_walkover: true },
      { p_match_id: 'm2', p_score1: null, p_score2: null, p_winner: 'b', p_walkover: true },
    ])
  })
  it('does nothing when the tournament is not running or nobody is out', async () => {
    expect(await settleForfeits(fakeDb({ tables: { tournament_overview: { data: { ...T, status: 'open' } } } }).db, 't1')).toEqual({ settled: 0, completed: false })
    expect(await settleForfeits(fakeDb({ tables: { tournament_overview: { data: { ...T, status: 'active' } }, tournament_entrants: { data: [] } } }).db, 't1')).toEqual({ settled: 0, completed: false })
  })
})

describe('bracket', () => {
  const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: id(i + 1), display_name: `P${i + 1}`, seed: null, registered_at: `2030-01-01T00:00:0${i}Z` }))
  const mk = (t: object, entrants: object[], rpc: object = { data: 3 }) =>
    fakeDb({ tables: { tournament_overview: { data: { ...T, ...t } }, tournament_entrants: { data: entrants }, tournament_matches: { data: [] } }, rpcs: { save_bracket: rpc } })

  it('previews seeding and matches without saving', async () => {
    const f = mk({}, players(4))
    const p = await previewBracket('t1', undefined, f.db)
    expect(p.order.map((o) => o.seed)).toEqual([1, 2, 3, 4])
    expect(new Set(p.order.map((o) => o.id)).size).toBe(4)
    expect(p.rounds).toBe(2)
    expect(p.matches).toHaveLength(4) // 2 semis + final + third place (best_of 3, third place on)
    expect(p.matches.find((x) => x.bracket === 'third')).toBeTruthy()
    expect(p.matches.every((x) => x.best_of === 3)).toBe(true)
    expect(p.matches.map((x) => x.round_name)).toEqual(expect.arrayContaining(['Semi-final', 'Final', 'Third place']))
    expect(f.log.some((e) => e.rpc === 'save_bracket')).toBe(false)
  })
  it('uses the admin-chosen order exactly, and refuses an order that does not match the entrants', async () => {
    const f = mk({}, players(4))
    const order = [id(3), id(1), id(4), id(2)]
    const p = await previewBracket('t1', order, f.db)
    expect(p.order.map((o) => o.id)).toEqual(order)
    for (const bad of [[id(1), id(2)], [id(1), id(1), id(2), id(3)], [id(1), id(2), id(3), id(99)]]) {
      await expect(previewBracket('t1', bad, mk({}, players(4)).db)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('exactly once') })
    }
  })
  it('seeds by the saved seed then registration order when seeding is manual', async () => {
    const entrants = [{ ...players(3)[0], seed: 3 }, { ...players(3)[1], seed: 1 }, { ...players(3)[2], seed: 2 }]
    const p = await previewBracket('t1', undefined, mk({ seeding: 'manual' }, entrants).db)
    expect(p.order.map((o) => o.id)).toEqual([id(2), id(3), id(1)])
  })
  it('builds league fixtures for a league', async () => {
    const p = await previewBracket('t1', undefined, mk({ tournament_type: 'league', best_of: 1 }, players(4)).db)
    expect(p.matches).toHaveLength(6)
    expect(p.matches[0].round_name).toBe('Round 1')
    const dbl = await previewBracket('t1', undefined, mk({ tournament_type: 'league', double_round_robin: true }, players(4)).db)
    expect(dbl.matches).toHaveLength(12)
  })
  it('needs two entrants and a tournament that is not finished', async () => {
    await expect(previewBracket('t1', undefined, mk({}, players(1)).db)).rejects.toMatchObject({ message: expect.stringContaining('At least 2') })
    await expect(previewBracket('t1', undefined, mk({ status: 'completed' }, players(4)).db)).rejects.toMatchObject({ message: 'This tournament is finished' })
  })
  it('saves the generated matches and seeds through the database function', async () => {
    const f = mk({}, players(4))
    f.log // eslint-disable-line @typescript-eslint/no-unused-expressions
    await getSafe(() => startBracket('t1', [id(1), id(2), id(3), id(4)], f.db))
    const args = rpcArgs(f.log, 'save_bracket') as { p_tournament_id: string; p_matches: unknown[]; p_seeds: { id: string; seed: number }[] }
    expect(args.p_tournament_id).toBe('t1')
    expect(args.p_matches).toHaveLength(4)
    expect(args.p_seeds).toEqual([1, 2, 3, 4].map((n) => ({ id: id(n), seed: n })))
  })
  it('turns database refusals into clear messages', async () => {
    const f = mk({}, players(4), { error: { message: 'ALREADY_STARTED' } })
    await expect(startBracket('t1', undefined, f.db)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Undo the results') })
  })
  it('accepts an empty options object', () => {
    expect(bracketSchema.parse({})).toEqual({})
    expect(bracketSchema.parse(undefined)).toEqual({})
    expect(() => bracketSchema.parse({ order: ['nope'] })).toThrow()
  })
})

// startBracket returns the detail afterwards, which the minimal fake does not model; only the save call matters here.
async function getSafe<T>(fn: () => Promise<T>) { try { await fn() } catch { /* detail lookup */ } }

describe('results', () => {
  const rpcOnly = (data: object, over: object = {}) => fakeDb({
    tables: { tournament_matches: { data: { id: 'm1', tournament_id: 't1', status: 'ready' } }, tournament_overview: { data: { ...T, status: 'active' } }, tournament_entrants: { data: [] }, ...over },
    rpcs: { report_match_result: { data } },
  })
  it('passes Won / Lost and scores to the database function', async () => {
    const f = rpcOnly({ tournament_completed: false })
    await reportResult('m1', resultSchema.parse({ winner_id: id(2) }), f.db)
    expect(rpcArgs(f.log, 'report_match_result')).toEqual({ p_match_id: 'm1', p_score1: null, p_score2: null, p_winner: id(2), p_walkover: false })
    const g = rpcOnly({ tournament_completed: false })
    await reportResult('m1', resultSchema.parse({ score1: 2, score2: 1 }), g.db)
    expect(rpcArgs(g.log, 'report_match_result')).toMatchObject({ p_score1: 2, p_score2: 1, p_winner: null })
    expect(() => resultSchema.parse({ score1: -1 })).toThrow()
  })
  it('turns every database refusal into a message the admin can act on', async () => {
    const cases: [string, number, string][] = [
      ['MATCH_NOT_READY', 400, 'Both sides'], ['ALREADY_COMPLETED', 400, 'Undo it first'], ['SCORE_MISMATCH', 400, 'higher score'],
      ['DRAW_NOT_ALLOWED', 400, 'cannot end in a draw'], ['WINNER_REQUIRED', 400, 'Choose a winner'], ['NOT_ACTIVE', 400, 'not running'], ['MATCH_NOT_FOUND', 404, 'not found'],
    ]
    for (const [code, status, text] of cases) {
      const f = fakeDb({ tables: { tournament_matches: { data: { id: 'm1', tournament_id: 't1' } } }, rpcs: { report_match_result: { error: { message: code } } } })
      await expect(reportResult('m1', resultSchema.parse({}), f.db)).rejects.toMatchObject({ status, message: expect.stringContaining(text) })
    }
    await expect(reportResult('missing', resultSchema.parse({}), fakeDb({ tables: { tournament_matches: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
  })
  it('names the champion of a finished league from the table', async () => {
    const f = rpcOnly({ tournament_completed: true }, {
      tournament_overview: { data: { ...T, tournament_type: 'league', status: 'completed', champion_entrant_id: null } },
      tournament_entrants: { data: [{ id: id(1), seed: 1, registered_at: '1' }, { id: id(2), seed: 2, registered_at: '2' }] },
      tournament_matches: (calls: Call[]) => has(calls, 'maybeSingle')
        ? { data: { id: 'm1', tournament_id: 't1' } }
        : { data: [{ entrant1_id: id(1), entrant2_id: id(2), score1: 0, score2: 2, winner_id: id(2), status: 'completed' }] },
      tournaments: {},
    })
    const out = await reportResult('m1', resultSchema.parse({ winner_id: id(2) }), f.db)
    expect(out.tournament_completed).toBe(true)
    const update = f.log.find((e) => e.table === 'tournaments')!.calls.find((c) => c.method === 'update')!.args[0]
    expect(update).toEqual({ champion_entrant_id: id(2) })
  })
  it('leaves a finished knockout alone (the database already named the champion)', async () => {
    const f = rpcOnly({ tournament_completed: true, champion_entrant_id: id(5) }, { tournament_overview: { data: { ...T, status: 'completed', champion_entrant_id: id(5) } } })
    await reportResult('m1', resultSchema.parse({ winner_id: id(5) }), f.db)
    expect(f.log.some((e) => e.table === 'tournaments')).toBe(false)
  })
  it('undo maps its refusals', async () => {
    const mk = (code?: string) => fakeDb({ tables: { tournament_matches: { data: { id: 'm1', tournament_id: 't1' } } }, rpcs: { undo_match_result: code ? { error: { message: code } } : { data: { match_id: 'm1' } } } }).db
    await expect(undoResult('m1', mk())).resolves.toEqual({ match_id: 'm1' })
    await expect(undoResult('m1', mk('NEXT_MATCH_STARTED'))).rejects.toMatchObject({ message: expect.stringContaining('Undo that result first') })
    await expect(undoResult('m1', mk('NOT_COMPLETED'))).rejects.toMatchObject({ status: 400 })
  })
})

describe('match updates', () => {
  const mk = (status: string, extra: object = {}) => fakeDb({ tables: { tournament_matches: (calls: Call[]) => (has(calls, 'update') ? { data: { id: 'm1' }, ...extra } : { data: { id: 'm1', tournament_id: 't1', status } }) } }).db
  it('moves a ready match live and back, and nothing else', async () => {
    await expect(updateMatch('m1', matchUpdateSchema.parse({ status: 'live' }), mk('ready'))).resolves.toBeTruthy()
    await expect(updateMatch('m1', matchUpdateSchema.parse({ status: 'ready' }), mk('live'))).resolves.toBeTruthy()
    await expect(updateMatch('m1', matchUpdateSchema.parse({ status: 'live' }), mk('pending'))).rejects.toMatchObject({ status: 400 })
    await expect(updateMatch('m1', matchUpdateSchema.parse({ status: 'live' }), mk('completed'))).rejects.toMatchObject({ status: 400 })
    await expect(updateMatch('m1', matchUpdateSchema.parse({ status: 'ready' }), mk('ready'))).rejects.toMatchObject({ status: 400 })
  })
  it('schedules a match (IST) and complains about an unknown station', async () => {
    const parsed = matchUpdateSchema.parse({ scheduled_at: '2030-01-01T18:30', station_id: id(9), notes: 'Bring controllers' })
    expect(parsed.scheduled_at).toBe('2030-01-01T13:00:00.000Z')
    await expect(updateMatch('m1', parsed, mk('pending'))).resolves.toBeTruthy()
    await expect(updateMatch('m1', parsed, mk('pending', { error: { code: '23503' } }))).rejects.toMatchObject({ message: 'That station does not exist' })
    expect(() => matchUpdateSchema.parse({})).toThrow()
  })
})

describe('detail', () => {
  it('returns names, round names, standings for a league and the champion', async () => {
    const f = fakeDb({ tables: {
      tournament_overview: { data: { ...T, tournament_type: 'league', status: 'completed', champion_entrant_id: 'b' } },
      tournament_entrants: { data: [{ id: 'a', display_name: 'Ann', seed: 1, registered_at: '1', team_id: null }, { id: 'b', display_name: 'Bob', seed: 2, registered_at: '2', team_id: null }] },
      tournament_matches: { data: [{ id: 'm', round: 1, position: 1, bracket: 'main', entrant1_id: 'a', entrant2_id: 'b', score1: 0, score2: 1, winner_id: 'b', status: 'completed' }] },
    } })
    const d = await getTournamentDetail('t1', f.db)
    expect(d.champion_name).toBe('Bob')
    expect(d.matches[0]).toMatchObject({ entrant1_name: 'Ann', entrant2_name: 'Bob', winner_name: 'Bob', round_name: 'Round 1' })
    expect(d.standings.map((s) => [s.display_name, s.points])).toEqual([['Bob', 3], ['Ann', 0]])
  })
  it('names knockout rounds and lists team members', async () => {
    const f = fakeDb({ tables: {
      tournament_overview: { data: { ...T } },
      tournament_entrants: { data: [{ id: 'a', display_name: 'Team A', seed: 1, registered_at: '1', team_id: 'ta' }, { id: 'b', display_name: 'Team B', seed: 2, registered_at: '2', team_id: null }] },
      tournament_matches: { data: [{ id: 'f', round: 1, position: 1, bracket: 'main', entrant1_id: 'a', entrant2_id: 'b', status: 'ready' }] },
      tournament_team_members: { data: [{ team_id: 'ta', user_id: 'u1', status: 'accepted' }, { team_id: 'ta', user_id: 'u2', status: 'invited' }] },
      user_profiles: { data: [{ user_id: 'u1', username: 'ann', full_name: 'Ann Lee' }, { user_id: 'u2', username: 'raj', full_name: null }] },
    } })
    const d = await getTournamentDetail('t1', f.db)
    expect(d.matches[0].round_name).toBe('Final')
    expect(d.standings).toEqual([])
    expect(d.entrants[0].team_members).toEqual([{ user_id: 'u1', name: 'Ann Lee', status: 'accepted' }, { user_id: 'u2', name: 'raj', status: 'invited' }])
    expect(d.entrants[1].team_members).toEqual([])
  })
  it('404s for an unknown tournament', async () => {
    await expect(getTournamentDetail('x', fakeDb({ tables: { tournament_overview: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
  })
})

import { reshuffleBracket } from '../services/admin/tournaments'

describe('no-show reshuffle and contacts', () => {
  const started = { ...T, status: 'active', started_at: '2026-10-31', registered_count: 4 }
  const entrants = [
    { id: id(1), no_show: false, status: 'registered', registered_at: '1' }, { id: id(2), no_show: true, status: 'registered', registered_at: '2' },
    { id: id(3), no_show: false, status: 'registered', registered_at: '3' }, { id: id(4), no_show: true, status: 'checked_in', registered_at: '4' },
  ]
  const world = (over: Record<string, unknown> = {}, rpc: object = { data: 4 }) =>
    fakeDb({ tables: { tournament_overview: { data: { ...started, ...over } }, tournament_entrants: { data: entrants }, tournament_matches: { data: [] } }, rpcs: { save_bracket: rpc } })

  it('draws no-shows against no-shows and saves the new bracket', async () => {
    const w = world()
    const out = await reshuffleBracket('t1', w.db, () => 0.4)
    expect(out).toEqual({ reshuffled: true, replaced: 0, no_shows: 2, present: 2 })
    const saved = rpcArgs(w.log, 'save_bracket') as { p_matches: { round: number; entrant1_id: string | null; entrant2_id: string | null }[]; p_seeds: { id: string }[] }
    const round1 = saved.p_matches.filter((m) => m.round === 1)
    const pair = (m: { entrant1_id: string | null; entrant2_id: string | null }) => [m.entrant1_id, m.entrant2_id].sort()
    expect(round1.map(pair).sort()).toEqual([[id(1), id(3)], [id(2), id(4)]].sort())
    expect(saved.p_seeds).toHaveLength(4)
  })
  it('needs a generated knockout bracket', async () => {
    await expect(reshuffleBracket('t1', world({ status: 'open', started_at: null }).db)).rejects.toMatchObject({ message: 'Generate the bracket first' })
    await expect(reshuffleBracket('t1', world({ tournament_type: 'league' }).db)).rejects.toMatchObject({ status: 400 })
  })
  it('is refused once a real result exists', async () => {
    await expect(reshuffleBracket('t1', world({}, { error: { message: 'ALREADY_STARTED' } }).db)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('already been played') })
  })
  it('marks and clears a no-show through the normal entrant update', async () => {
    expect(updateEntrantSchema.parse({ no_show: true })).toEqual({ no_show: true })
    expect(updateEntrantSchema.parse({ no_show: false })).toEqual({ no_show: false })
  })
  it('adds email and phone to the entrants only for staff screens', async () => {
    const f = () => fakeDb({
      tables: { tournament_overview: { data: T }, tournament_entrants: { data: [{ id: id(1), display_name: 'A', registered_at: '1' }] }, tournament_matches: { data: [] } },
      rpcs: { tournament_contacts: { data: [{ entrant_id: id(1), email: 'a@x.com', phone: '999' }] } },
    })
    const withC = await getTournamentDetail('t1', f().db, { contacts: true })
    expect(withC.entrants[0]).toMatchObject({ email: 'a@x.com', phone: '999' })
    const plain = f()
    const without = await getTournamentDetail('t1', plain.db)
    expect(without.entrants[0]).not.toHaveProperty('email')
    expect(rpcArgs(plain.log, 'tournament_contacts')).toBeUndefined()
  })

  // an entrants table that behaves like the real one: filters by status and applies updates
  const statefulEntrants = (initial: object[]) => {
    const rows = initial.map((r) => ({ ...r })) as { id: string; status: string }[]
    return (calls: Call[]) => {
      const inCall = (col: string) => calls.find((c) => c.method === 'in' && c.args[0] === col)?.args[1] as string[] | undefined
      if (has(calls, 'update')) {
        const set = argOf(calls, 'update') as object
        rows.filter((r) => inCall('id')?.includes(r.id)).forEach((r) => Object.assign(r, set))
        return {}
      }
      const statuses = inCall('status')
      return { data: rows.filter((r) => !statuses || statuses.includes(r.status)) }
    }
  }

  describe('replacing no-shows from the waitlist', () => {
    const waiting = [
      { id: id(7), no_show: false, status: 'waitlist', registered_at: '7' },
      { id: id(6), no_show: false, status: 'waitlist', registered_at: '6' },
      { id: id(8), no_show: false, status: 'waitlist', registered_at: '8' },
    ]
    const w = (over: { matches?: object[]; rpc?: object } = {}) =>
      fakeDb({
        tables: {
          tournament_overview: { data: started },
          tournament_entrants: statefulEntrants([...entrants, ...waiting]),
          tournament_matches: { data: over.matches ?? [] },
        },
        rpcs: { save_bracket: over.rpc ?? { data: 4 } },
      })
    const updates = (log: ReturnType<typeof fakeDb>['log']) =>
      log.filter((e) => e.table === 'tournament_entrants' && has(e.calls, 'update')).map((e) => ({ set: argOf(e.calls, 'update'), ids: e.calls.find((c) => c.method === 'in')?.args[1] }))

    it('swaps each no-show for the oldest waiting player, then draws with the new field', async () => {
      const f = w()
      const out = await reshuffleBracket('t1', f.db, () => 0.4, { replaceFromWaitlist: true })
      expect(out).toEqual({ reshuffled: true, replaced: 2, no_shows: 0, present: 4 })
      expect(updates(f.log)).toEqual([
        { set: { status: 'withdrawn' }, ids: [id(2), id(4)] },
        { set: { status: 'registered' }, ids: [id(6), id(7)] }, // 6 signed up before 7; 8 stays waiting
      ])
      const saved = rpcArgs(f.log, 'save_bracket') as { p_seeds: { id: string }[] }
      expect(saved.p_seeds.map((x) => x.id).sort()).toEqual([id(1), id(3), id(6), id(7)].sort())
    })
    it('swaps as many as the waitlist allows and pairs the remaining no-shows together', async () => {
      const f = fakeDb({
        tables: {
          tournament_overview: { data: started },
          tournament_entrants: statefulEntrants([...entrants, waiting[1]]), // one waiting player, two no-shows
          tournament_matches: { data: [] },
        },
        rpcs: { save_bracket: { data: 4 } },
      })
      const out = await reshuffleBracket('t1', f.db, () => 0.4, { replaceFromWaitlist: true })
      expect(out).toMatchObject({ replaced: 1, no_shows: 1 })
    })
    it('leaves the waitlist alone when the option is off', async () => {
      const f = w()
      const out = await reshuffleBracket('t1', f.db, () => 0.4, { replaceFromWaitlist: false })
      expect(out).toMatchObject({ replaced: 0, no_shows: 2 })
      expect(updates(f.log)).toEqual([])
    })
    it('changes nobody when a result already exists', async () => {
      const f = w({ matches: [{ id: 'm1' }] })
      await expect(reshuffleBracket('t1', f.db, () => 0.4, { replaceFromWaitlist: true })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('already been played') })
      expect(updates(f.log)).toEqual([])
    })
    it('puts everyone back when saving the new bracket fails', async () => {
      const f = w({ rpc: { error: { message: 'weird' } } })
      await expect(reshuffleBracket('t1', f.db, () => 0.4, { replaceFromWaitlist: true })).rejects.toMatchObject({ status: 500 })
      const u = updates(f.log)
      expect(u.slice(-2)).toEqual([
        { set: { status: 'registered' }, ids: [id(2), id(4)] },
        { set: { status: 'waitlist' }, ids: [id(6), id(7)] },
      ])
    })
  })
})
