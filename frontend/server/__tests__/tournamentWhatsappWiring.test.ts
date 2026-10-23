import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, type Call } from './fakeDb'

vi.mock('../services/tournamentNotifications', () => ({ notifyEntrants: vi.fn(async () => []), formatStart: () => '' }))

import { notifyEntrants } from '../services/tournamentNotifications'
import { acceptInvite, registerForTournament, withdrawFromTournament } from '../services/tournaments'
import { addEntrant, reshuffleBracket, updateEntrant } from '../services/admin/tournaments'

const spy = vi.mocked(notifyEntrants)
const has = (c: Call[], m: string) => c.some((x) => x.method === m)
const argOf = (c: Call[], m: string) => c.find((x) => x.method === m)?.args[0]
const T = { id: 't1', name: 'Cup', status: 'open', tournament_type: 'knockout', max_players: 4, registered_count: 1, waitlist_count: 0, started_at: null, registration_closes_at: null, entry_fee: 0, team_size: 1, best_of: 1, third_place_match: false, double_round_robin: false, seeding: 'random' }
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

beforeEach(() => spy.mockClear())

describe('WhatsApp is sent from the places where people get a place', () => {
  it('a player registers', async () => {
    const db = fakeDb({ tables: { tournament_overview: { data: T }, user_profiles: { data: { username: 'neo' } }, tournament_entrants: { data: { id: 'e1' } } } }).db
    await registerForTournament('u1', 't1', db)
    expect(spy).toHaveBeenCalledWith(db, 't1', ['e1'], 'registered')
  })
  it('a registration that fails sends nothing', async () => {
    const db = fakeDb({ tables: { tournament_overview: { data: T }, user_profiles: { data: null }, tournament_entrants: { error: { code: '23505' } } } }).db
    await expect(registerForTournament('u1', 't1', db)).rejects.toMatchObject({ message: 'Already registered' })
    expect(spy).not.toHaveBeenCalled()
  })
  it('a withdrawal gives the oldest waiting player their place, and they are told', async () => {
    const db = fakeDb({ tables: { tournament_overview: { data: { ...T, waitlist_count: 1 } }, tournament_entrants: { data: [{ id: 'w1' }] } } }).db
    await withdrawFromTournament('u1', 't1', db)
    expect(spy).toHaveBeenCalledWith(db, 't1', ['w1'], 'moved_up')
  })
  it('staff promote a waiting player by hand', async () => {
    const db = fakeDb({ tables: { tournament_overview: { data: T }, tournament_entrants: { data: { id: id(1), status: 'waitlist', tournament_id: 't1' } } } }).db
    await updateEntrant('t1', id(1), { status: 'registered' }, db)
    expect(spy).toHaveBeenCalledWith(db, 't1', [id(1)], 'moved_up')
  })
  it('staff add a member (told) or a walk-in by name (not)', async () => {
    const member = fakeDb({ tables: { tournament_overview: { data: T }, user_profiles: { data: { user_id: 'u1', username: 'neo', full_name: 'Neo' } }, tournament_entrants: { data: { id: 'e1' } } } }).db
    await addEntrant('t1', { username: 'neo' }, member)
    expect(spy).toHaveBeenCalledWith(member, 't1', ['e1'], 'registered')
    spy.mockClear()
    const walkIn = fakeDb({ tables: { tournament_overview: { data: T }, tournament_entrants: { data: { id: 'e2' } } } }).db
    await addEntrant('t1', { display_name: 'Walk-in' }, walkIn)
    expect(spy).not.toHaveBeenCalled()
  })
  it('a team becomes complete when the last member accepts', async () => {
    const db = fakeDb({
      tables: {
        tournament_overview: { data: { ...T, team_size: 2 } },
        tournament_teams: { data: { id: 'tm1', name: 'Reds', captain_id: 'u1' } },
        tournament_team_members: (c: Call[]) => (has(c, 'update') ? {} : has(c, 'maybeSingle') ? { data: { status: 'invited' } } : { count: 2 }),
        tournament_entrants: { data: { id: 'e1' } },
      },
    }).db
    const out = await acceptInvite('u2', 't1', id(1), db)
    expect(out.complete).toBe(true)
    expect(spy).toHaveBeenCalledWith(db, 't1', ['e1'], 'registered')
  })
})

describe('reshuffle tells replacements only when their place is certain', () => {
  const entrants = [
    { id: id(1), no_show: false, status: 'registered', registered_at: '1' }, { id: id(2), no_show: true, status: 'registered', registered_at: '2' },
    { id: id(3), no_show: false, status: 'registered', registered_at: '3' }, { id: id(5), no_show: false, status: 'waitlist', registered_at: '5' },
  ]
  const table = (initial: object[]) => {
    const rows = initial.map((r) => ({ ...r })) as { id: string; status: string }[]
    return (calls: Call[]) => {
      const inCall = (col: string) => calls.find((c) => c.method === 'in' && c.args[0] === col)?.args[1] as string[] | undefined
      if (has(calls, 'update')) { rows.filter((r) => inCall('id')?.includes(r.id)).forEach((r) => Object.assign(r, argOf(calls, 'update'))); return {} }
      const statuses = inCall('status')
      return { data: rows.filter((r) => !statuses || statuses.includes(r.status)) }
    }
  }
  const started = { ...T, status: 'active', started_at: 'x', registered_count: 3 }

  it('after the new bracket is saved', async () => {
    const db = fakeDb({ tables: { tournament_overview: { data: started }, tournament_entrants: table(entrants), tournament_matches: { data: [] } }, rpcs: { save_bracket: { data: 4 } } }).db
    await reshuffleBracket('t1', db, () => 0.4, { replaceFromWaitlist: true })
    expect(spy).toHaveBeenCalledWith(db, 't1', [id(5)], 'moved_up')
  })
  it('not at all if saving the new bracket fails (they are put back on the waitlist)', async () => {
    const db = fakeDb({ tables: { tournament_overview: { data: started }, tournament_entrants: table(entrants), tournament_matches: { data: [] } }, rpcs: { save_bracket: { error: { message: 'weird' } } } }).db
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(reshuffleBracket('t1', db, () => 0.4, { replaceFromWaitlist: true })).rejects.toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
  })
})
