import { describe, expect, it } from 'vitest'
import { fakeDb, type Call } from './fakeDb'
import {
  acceptInvite, createTeam, getPublicTournament, inviteToTeam, leaveTeam, myInvitations, recordView, registerForTournament,
  teamSchema, viewSchema, withdrawFromTournament,
} from '../services/tournaments'

const T = {
  id: 't1', name: 'Cup', status: 'open', tournament_type: 'knockout', max_players: 4, registered_count: 1, waitlist_count: 0,
  started_at: null, registration_closes_at: null, entry_fee: 0, team_size: 1,
}
const has = (calls: Call[], m: string) => calls.some((c) => c.method === m)
const arg = (calls: Call[], m: string) => calls.find((c) => c.method === m)?.args[0] as Record<string, unknown>
const inserted = (log: ReturnType<typeof fakeDb>['log'], table: string) => {
  const e = log.find((x) => x.table === table && has(x.calls, 'insert'))
  return e ? arg(e.calls, 'insert') : undefined
}
const overview = (over: object = {}) => ({ tournament_overview: { data: { ...T, ...over } } })

describe('solo registration', () => {
  it('registers, puts the player on the waitlist when full, and prices the entry', async () => {
    const a = fakeDb({ tables: { ...overview(), user_profiles: { data: { username: 'neo', full_name: 'Neo A' } }, tournament_entrants: {} } })
    await expect(registerForTournament('u1', 't1', a.db)).resolves.toMatchObject({ status: 'registered' })
    expect(inserted(a.log, 'tournament_entrants')).toMatchObject({ user_id: 'u1', display_name: 'Neo A', status: 'registered', payment_status: 'NOT_REQUIRED' })

    const b = fakeDb({ tables: { ...overview({ registered_count: 4, entry_fee: 100 }), user_profiles: { data: { username: 'neo' } }, tournament_entrants: {} } })
    await expect(registerForTournament('u1', 't1', b.db)).resolves.toMatchObject({ status: 'waitlist' })
    expect(inserted(b.log, 'tournament_entrants')).toMatchObject({ status: 'waitlist', payment_status: 'PENDING', display_name: 'neo' })
  })
  it('refuses when closed, past the deadline, started, team format, a draft, or a duplicate', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    for (const over of [{ status: 'paused' }, { registration_closes_at: past }, { started_at: '2030-01-01' }, { team_size: 2 }]) {
      await expect(registerForTournament('u1', 't1', fakeDb({ tables: overview(over) }).db)).rejects.toMatchObject({ status: 400 })
    }
    await expect(registerForTournament('u1', 't1', fakeDb({ tables: { tournament_overview: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
    const dup = fakeDb({ tables: { ...overview(), user_profiles: { data: null }, tournament_entrants: { error: { code: '23505' } } } })
    await expect(registerForTournament('u1', 't1', dup.db)).rejects.toMatchObject({ message: 'Already registered' })
  })
  it('only the draft filter hides drafts', async () => {
    const { log, db } = fakeDb({ tables: overview() })
    await registerForTournament('u1', 't1', fakeDb({ tables: { ...overview(), tournament_entrants: {}, user_profiles: {} } }).db)
    const f = fakeDb({ tables: { tournament_overview: { data: null } } })
    await expect(withdrawFromTournament('u1', 't1', f.db)).rejects.toMatchObject({ status: 404 })
    expect(log.length + (db ? 0 : 1)).toBe(0)
  })
  it('withdraws before the bracket exists, not after', async () => {
    const ok = fakeDb({ tables: { ...overview(), tournament_entrants: { data: { id: 'e1' } } } })
    await expect(withdrawFromTournament('u1', 't1', ok.db)).resolves.toEqual({ message: 'You have been withdrawn' })
    expect(arg(ok.log.find((e) => e.table === 'tournament_entrants')!.calls, 'update')).toEqual({ status: 'withdrawn' })
    await expect(withdrawFromTournament('u1', 't1', fakeDb({ tables: overview({ status: 'active', started_at: 'x' }) }).db)).rejects.toMatchObject({ status: 400 })
    await expect(withdrawFromTournament('u1', 't1', fakeDb({ tables: { ...overview(), tournament_entrants: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
  })
})

describe('teams', () => {
  const TEAM = { ...T, team_size: 3 }
  const world = (over: Record<string, any> = {}) => // eslint-disable-line @typescript-eslint/no-explicit-any
    fakeDb({
      tables: {
        tournament_overview: { data: { ...TEAM, ...(over.t ?? {}) } },
        user_profiles: (calls: Call[]) => ({ data: { user_id: `id-${String(calls.find((c) => c.method === 'ilike')?.args[1] ?? 'x')}`, username: 'pal' } }),
        tournament_teams: { data: { id: 'tm1', name: 'Reds', captain_id: 'u1', ...(over.team ?? {}) }, error: over.teamError ?? null },
        tournament_team_members: (calls: Call[]) =>
          has(calls, 'insert') || has(calls, 'update') || has(calls, 'delete')
            ? { data: 'memberRow' in over ? over.memberRow : { user_id: 'u2' }, error: over.memberError ?? null }
            : has(calls, 'maybeSingle')
              ? { data: 'invite' in over ? over.invite : { status: 'invited' } }
              : { count: over.accepted ?? 1 },
        tournament_entrants: {},
      },
    })

  it('validates the form', () => {
    expect(teamSchema.parse({ name: ' Reds ' })).toEqual({ name: 'Reds', usernames: [] })
    expect(() => teamSchema.parse({ name: 'R' })).toThrow()
    expect(() => viewSchema.parse({ visitor_id: 'short' })).toThrow()
  })
  it('creates a team with the captain accepted and invitees invited; not entered until complete', async () => {
    const w = world({ accepted: 1 })
    const out = await createTeam('u1', 't1', teamSchema.parse({ name: 'Reds', usernames: ['Ann', 'ann', 'Bob'] }), w.db)
    expect(out).toMatchObject({ complete: false, team_id: 'tm1' })
    const members = inserted(w.log, 'tournament_team_members') as unknown as { user_id: string; status: string }[]
    expect(members.map((m) => m.status)).toEqual(['accepted', 'invited', 'invited']) // duplicate "ann" collapsed
    expect(members[0].user_id).toBe('u1')
    expect(inserted(w.log, 'tournament_entrants')).toBeUndefined()
  })
  it('enters the team once everyone has accepted', async () => {
    const w = world({ accepted: 3 })
    expect(await createTeam('u1', 't1', teamSchema.parse({ name: 'Reds' }), world({ accepted: 3 }).db)).toMatchObject({ complete: true })
    const out = await acceptInvite('u2', 't1', '00000000-0000-4000-8000-000000000001', w.db)
    expect(out.complete).toBe(true)
    expect(inserted(w.log, 'tournament_entrants')).toMatchObject({ team_id: 'tm1', display_name: 'Reds', status: 'registered' })
  })
  it('refuses too many invitees, solo tournaments, and inviting yourself', async () => {
    await expect(createTeam('u1', 't1', teamSchema.parse({ name: 'Reds', usernames: ['a', 'b', 'c'] }), world().db)).rejects.toMatchObject({ status: 400 })
    await expect(createTeam('u1', 't1', teamSchema.parse({ name: 'Reds' }), world({ t: { team_size: 1 } }).db)).rejects.toMatchObject({ message: 'This is a solo tournament' })
    const me = fakeDb({ tables: { ...overview({ team_size: 2 }), user_profiles: { data: { user_id: 'u1', username: 'me' } } } })
    await expect(createTeam('u1', 't1', teamSchema.parse({ name: 'Reds', usernames: ['me'] }), me.db)).rejects.toMatchObject({ message: expect.stringContaining('your own team') })
  })
  it('maps clashes: team name taken, already on a team', async () => {
    await expect(createTeam('u1', 't1', teamSchema.parse({ name: 'Reds' }), world({ teamError: { code: '23505' } }).db)).rejects.toMatchObject({ message: expect.stringContaining('name is taken') })
    await expect(createTeam('u1', 't1', teamSchema.parse({ name: 'Reds' }), world({ memberError: { code: '23505' } }).db)).rejects.toMatchObject({ message: expect.stringContaining('already on a team') })
    await expect(acceptInvite('u2', 't1', 'tm1', world({ memberError: { code: '23505' } }).db)).rejects.toMatchObject({ message: expect.stringContaining('another team') })
  })
  it('accept needs a pending invitation', async () => {
    await expect(acceptInvite('u2', 't1', 'tm1', world({ invite: null }).db)).rejects.toMatchObject({ status: 404 })
    await expect(acceptInvite('u2', 't1', 'tm1', world({ invite: { status: 'accepted' } }).db)).rejects.toMatchObject({ message: 'You already accepted' })
  })
  it('only the captain invites, and not past the team size', async () => {
    const inv = { username: 'zed' }
    await expect(inviteToTeam('u2', 't1', 'tm1', inv, world().db)).rejects.toMatchObject({ status: 403 })
    await expect(inviteToTeam('u1', 't1', 'tm1', inv, world({ accepted: 3 }).db)).rejects.toMatchObject({ message: 'The team is already full' })
    await expect(inviteToTeam('u1', 't1', 'tm1', inv, world({ accepted: 2 }).db)).resolves.toMatchObject({ message: 'Invitation sent to pal' })
  })
  it('a member leaving frees the place; the captain leaving disbands', async () => {
    const m = world()
    await expect(leaveTeam('u2', 't1', 'tm1', m.db)).resolves.toEqual({ message: 'You left the team' })
    expect(m.log.some((e) => e.table === 'tournament_entrants' && has(e.calls, 'delete'))).toBe(true)
    const c = world()
    await expect(leaveTeam('u1', 't1', 'tm1', c.db)).resolves.toEqual({ message: 'Team disbanded' })
    expect(c.log.some((e) => e.table === 'tournament_teams' && has(e.calls, 'delete'))).toBe(true)
    await expect(leaveTeam('u2', 't1', 'tm1', world({ t: { status: 'active', started_at: 'x' } }).db)).rejects.toMatchObject({ status: 400 })
    await expect(leaveTeam('u3', 't1', 'tm1', world({ memberRow: null }).db)).rejects.toMatchObject({ status: 404 })
  })
  it('lists pending invitations for open tournaments only', async () => {
    const mk = (status: string) => fakeDb({ tables: {
      tournament_team_members: { data: [{ team_id: 'tm1', tournament_id: 't1' }] },
      tournament_teams: { data: { name: 'Reds', captain_id: 'u1' } },
      tournament_overview: { data: { id: 't1', name: 'Cup', status, started_at: null } },
      user_profiles: { data: { username: 'cap', full_name: 'Captain' } },
    } }).db
    expect(await myInvitations('u2', mk('open'))).toEqual([{ team_id: 'tm1', team_name: 'Reds', tournament_id: 't1', tournament_name: 'Cup', captain: 'Captain' }])
    expect(await myInvitations('u2', mk('completed'))).toEqual([])
  })
})

describe('public detail and views', () => {
  it('hides user ids and payments, hides withdrawn entrants, and tells a player about themselves', async () => {
    const { db } = fakeDb({ tables: {
      tournament_overview: { data: { ...T, rules: 'r', banner_image: '', secret: 'x' } },
      tournament_entrants: (calls: Call[]) => has(calls, 'maybeSingle')
        ? { data: { id: 'e1', status: 'registered', payment_status: 'PENDING' } }
        : { data: [
          { id: 'e1', display_name: 'Neo', user_id: 'u1', payment_status: 'PAID', status: 'registered', seed: 1, team_id: null },
          { id: 'e2', display_name: 'Gone', user_id: 'u9', payment_status: 'PAID', status: 'withdrawn', seed: null, team_id: null },
        ] },
      tournament_matches: { data: [] },
      tournament_team_members: { data: [] },
    } })
    const out = await getPublicTournament('t1', 'u1', db)
    expect(out.entrants).toEqual([{ id: 'e1', display_name: 'Neo', seed: 1, status: 'registered', team_members: [] }])
    expect(JSON.stringify(out)).not.toMatch(/user_id|payment_status":"PAID|secret/)
    expect(out.me).toMatchObject({ entrant: { id: 'e1' }, teams: [] })
    expect((await getPublicTournament('t1', null, db)).me).toBeNull()
    await expect(getPublicTournament('t1', null, fakeDb({ tables: { tournament_overview: { data: null } } }).db)).rejects.toMatchObject({ status: 404 })
  })
  it('records a view', async () => {
    const ok = fakeDb({ rpcs: { record_tournament_view: { data: 7 } } })
    await expect(recordView('t1', 'visitor-123', ok.db)).resolves.toEqual({ view_count: 7 })
    await expect(recordView('t1', 'visitor-123', fakeDb({ rpcs: { record_tournament_view: { error: { message: 'TOURNAMENT_NOT_FOUND' } } } }).db)).rejects.toMatchObject({ status: 404 })
    await expect(recordView('t1', 'visitor-123', fakeDb({ rpcs: { record_tournament_view: { error: { message: 'INVALID_VISITOR' } } } }).db)).rejects.toMatchObject({ status: 400 })
  })
})
