import { describe, expect, it } from 'vitest'
import { fakeDb, rpcArgs } from './fakeDb'
import { moveEntrantToDay, moveSchema, splitSchema, splitTournament } from '../services/admin/tournamentDays'

const T = { id: 't1', name: 'NEO RIFT - EAFC SEASON 1', status: 'open', tournament_type: 'knockout', max_players: 128, team_size: 1, started_at: null, split_days: null, parent_id: null, starts_at: '2026-11-14T05:30:00Z', registered_count: 5, waitlist_count: 1 }
const rows = [...Array.from({ length: 6 }, (_, i) => ({ id: `r${i + 1}`, status: 'registered', registered_at: String(i + 1) })), { id: 'w1', status: 'waitlist', registered_at: '9' }]
const world = (t: object = {}, rpc: object = { data: { days: ['d1', 'd2'] } }) =>
  fakeDb({ tables: { tournament_overview: { data: { ...T, ...t } }, tournament_entrants: { data: rows } }, rpcs: { split_tournament_into_days: rpc } })

describe('splitTournament', () => {
  it('previews the counts without changing anything', async () => {
    const w = world()
    const out = await splitTournament('t1', splitSchema.parse({ preview: true, capacity: 3 }), w.db)
    expect(out).toMatchObject({ preview: true, capacity: 3, days: [{ day: 1, players: 3, waitlist: 1 }, { day: 2, players: 3, waitlist: 0 }] })
    expect(rpcArgs(w.log, 'split_tournament_into_days')).toBeUndefined()
  })
  it('defaults to half the limit per day', async () => {
    const out = await splitTournament('t1', splitSchema.parse({ preview: true }), world().db)
    expect(out.capacity).toBe(64)
  })
  it('sends each day its name, capacity, start (a day later each) and players', async () => {
    const w = world()
    const out = await splitTournament('t1', splitSchema.parse({ method: 'first', capacity: 3 }), w.db)
    const a = rpcArgs(w.log, 'split_tournament_into_days')!
    expect(a.p_parent_id).toBe('t1')
    expect(a.p_days).toEqual([
      { name: 'NEO RIFT - EAFC SEASON 1 - Day 1', max_players: 3, starts_at: '2026-11-14T05:30:00.000Z', active: ['r1', 'r2', 'r3'], waitlist: ['w1'] },
      { name: 'NEO RIFT - EAFC SEASON 1 - Day 2', max_players: 3, starts_at: '2026-11-15T05:30:00.000Z', active: ['r4', 'r5', 'r6'], waitlist: [] },
    ])
    expect(out.days.map((d) => (d as unknown as { id: string | null }).id)).toEqual(['d1', 'd2'])
  })
  it('refuses a started tournament, a team tournament, one already split, and one that is itself a day', async () => {
    const run = (t: object) => splitTournament('t1', splitSchema.parse({}), world(t).db)
    await expect(run({ started_at: 'x' })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('bracket') })
    await expect(run({ status: 'active' })).rejects.toMatchObject({ status: 400 })
    await expect(run({ team_size: 2 })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('solo') })
    await expect(run({ split_days: 2 })).rejects.toMatchObject({ status: 400 })
    await expect(run({ parent_id: 'p' })).rejects.toMatchObject({ status: 400 })
  })
  it('explains a missing SQL file and database refusals', async () => {
    const bad = (rpc: object) => splitTournament('t1', splitSchema.parse({ capacity: 3 }), world({}, rpc).db)
    await expect(bad({ error: { code: 'PGRST202', message: 'could not find the function' } })).rejects.toMatchObject({ status: 503, message: expect.stringContaining('21_tournament_days.sql') })
    await expect(bad({ error: { message: 'ALREADY_STARTED' } })).rejects.toMatchObject({ status: 400 })
  })
})

describe('moveEntrantToDay', () => {
  const w = (rpc: object) => fakeDb({
    tables: { tournament_entrants: { data: { tournament_id: 'dayA' } }, tournament_overview: { data: { id: 'dayA', status: 'open', max_players: 64, registered_count: 64, waitlist_count: 0, started_at: null } } },
    rpcs: { move_entrant_to_day: rpc },
  })
  const to = '00000000-0000-4000-8000-000000000002'
  it('moves a player and reports where they ended up', async () => {
    const f = w({ data: { status: 'waitlist', tournament_id: to } })
    await expect(moveEntrantToDay('e1', moveSchema.parse({ to_tournament_id: to }), f.db)).resolves.toMatchObject({ status: 'waitlist' })
    expect(rpcArgs(f.log, 'move_entrant_to_day')).toEqual({ p_entrant_id: 'e1', p_to_tournament_id: to })
  })
  it('explains refusals', async () => {
    const run = (m: string) => moveEntrantToDay('e1', { to_tournament_id: to }, w({ error: { message: m } }).db)
    await expect(run('NOT_SIBLINGS')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('same tournament') })
    await expect(run('ALREADY_STARTED')).rejects.toMatchObject({ status: 400 })
    await expect(run('ENTRANT_NOT_MOVABLE')).rejects.toMatchObject({ status: 400 })
  })
})
