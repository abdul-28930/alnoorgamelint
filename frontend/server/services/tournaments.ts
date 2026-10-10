import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest, notFound } from '../http'
import { getSupabase } from '../supabase'
import { getTournamentDetail, promoteWaitlist } from './admin/tournaments'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const fail = (msg: string, error: unknown) => {
  console.error(`${msg}:`, error)
  return new ApiError(500, msg)
}
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(40),
  usernames: z.array(z.string().trim().min(1).max(30)).max(9).default([]),
})
export const inviteSchema = z.object({ username: z.string().trim().min(1).max(30) })
export const viewSchema = z.object({ visitor_id: z.string().min(8).max(64) })

async function loadOpen(db: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await db.from('tournament_overview').select('*').eq('id', id).neq('status', 'draft').maybeSingle()
  if (error) throw fail('Failed to load the tournament', error)
  if (!data) throw notFound('Tournament not found')
  return data
}

/** Registration rules shared by solo sign-up and team creation. */
function assertRegistrationOpen(t: Row) {
  if (t.status !== 'open' || t.started_at) throw badRequest('Registration is not open for this tournament')
  if (t.registration_closes_at && new Date(t.registration_closes_at).getTime() <= Date.now()) throw badRequest('Registration has closed')
}

// ---- reading ------------------------------------------------------------------------------------

export async function listPublicTournaments(db: SupabaseClient = getSupabase()) {
  const { data, error } = await db
    .from('tournament_overview')
    .select('id, name, game, platform, status, tournament_type, max_players, team_size, best_of, entry_fee, prize_pool, description, banner_image, poster_image, starts_at, registration_closes_at, registered_count, waitlist_count, view_count, champion_entrant_id')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
  if (error) throw fail('Failed to load tournaments', error)
  return data ?? []
}

/** What a signed-in player sees about themselves in a tournament. */
async function describeMe(db: SupabaseClient, tournamentId: string, userId: string) {
  const [{ data: solo }, { data: memberships }] = await Promise.all([
    db.from('tournament_entrants').select('id, status, payment_status').eq('tournament_id', tournamentId).eq('user_id', userId).neq('status', 'withdrawn').maybeSingle(),
    db.from('tournament_team_members').select('team_id, status').eq('tournament_id', tournamentId).eq('user_id', userId),
  ])
  const teams = await Promise.all(
    ((memberships ?? []) as Row[]).map(async (m) => {
      const { data: team } = await db.from('tournament_teams').select('id, name, captain_id').eq('id', m.team_id).maybeSingle()
      if (!team) return null
      const { data: members } = await db.from('tournament_team_members').select('user_id, status').eq('team_id', team.id)
      const ids = ((members ?? []) as Row[]).map((x) => x.user_id as string)
      const { data: profiles } = ids.length
        ? await db.from('user_profiles').select('user_id, username, full_name').in('user_id', ids)
        : { data: [] as Row[] }
      const nameOf = new Map(((profiles ?? []) as Row[]).map((p) => [p.user_id as string, (p.full_name || p.username) as string]))
      const { data: entrant } = await db.from('tournament_entrants').select('id, status, payment_status').eq('team_id', team.id).maybeSingle()
      return {
        id: team.id as string,
        name: team.name as string,
        is_captain: team.captain_id === userId,
        my_status: m.status as string,
        entrant: entrant ?? null,
        members: ((members ?? []) as Row[]).map((x) => ({ name: nameOf.get(x.user_id) ?? 'Player', status: x.status as string })),
      }
    }),
  )
  return { entrant: solo ?? null, teams: teams.filter(Boolean) }
}

export async function getPublicTournament(id: string, userId: string | null, db: SupabaseClient = getSupabase()) {
  await loadOpen(db, id)
  const d = await getTournamentDetail(id, db)
  const t = d.tournament
  const me = userId ? await describeMe(db, id, userId) : null
  return {
    tournament: {
      id: t.id, name: t.name, game: t.game, platform: t.platform, status: t.status, tournament_type: t.tournament_type,
      max_players: t.max_players, team_size: t.team_size, best_of: t.best_of, third_place_match: t.third_place_match,
      entry_fee: t.entry_fee, prize_pool: t.prize_pool, prize_details: t.prize_details, rules: t.rules, description: t.description,
      banner_image: t.banner_image, poster_image: t.poster_image, starts_at: t.starts_at, registration_closes_at: t.registration_closes_at,
      registered_count: t.registered_count, waitlist_count: t.waitlist_count, view_count: t.view_count,
      champion_entrant_id: t.champion_entrant_id,
    },
    // never expose user ids or payment state
    entrants: d.entrants
      .filter((e: Row) => e.status !== 'withdrawn')
      .map((e: Row) => ({
        id: e.id, display_name: e.display_name, seed: e.seed, status: e.status,
        team_members: (e.team_members ?? []).filter((m: Row) => m.status === 'accepted').map((m: Row) => ({ name: m.name })),
      })),
    matches: d.matches,
    rounds: d.rounds,
    standings: d.standings,
    champion_name: d.champion_name,
    me,
  }
}

export async function recordView(id: string, visitorId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('record_tournament_view', { p_tournament_id: id, p_visitor: visitorId })
  if (error) {
    if (String(error.message).includes('TOURNAMENT_NOT_FOUND')) throw notFound('Tournament not found')
    if (String(error.message).includes('INVALID_VISITOR')) throw badRequest('Invalid visitor id')
    throw fail('Failed to record the view', error)
  }
  return { view_count: data as number }
}

// ---- solo ---------------------------------------------------------------------------------------

async function profileName(db: SupabaseClient, userId: string): Promise<string> {
  const { data } = await db.from('user_profiles').select('username, full_name').eq('user_id', userId).maybeSingle()
  return (data?.full_name || data?.username || 'Player') as string
}

function entrantRow(t: Row, extra: Row) {
  return {
    tournament_id: t.id,
    status: t.registered_count >= t.max_players ? 'waitlist' : 'registered',
    payment_status: Number(t.entry_fee) > 0 ? 'PENDING' : 'NOT_REQUIRED',
    ...extra,
  }
}

export async function registerForTournament(userId: string, tournamentId: string, db: SupabaseClient = getSupabase()) {
  const t = await loadOpen(db, tournamentId)
  assertRegistrationOpen(t)
  if (t.team_size > 1) throw badRequest('This is a team tournament. Create or join a team instead')

  const row = entrantRow(t, { user_id: userId, display_name: await profileName(db, userId) })
  const { error } = await db.from('tournament_entrants').insert(row)
  if (error?.code === '23505') throw badRequest('Already registered')
  if (error) throw fail('Failed to register', error)
  return { message: row.status === 'waitlist' ? 'The tournament is full. You are on the waitlist' : 'Registered successfully', status: row.status }
}

/** Players can leave themselves until the bracket exists; after that staff handle it (it affects other matches). */
export async function withdrawFromTournament(userId: string, tournamentId: string, db: SupabaseClient = getSupabase()) {
  const t = await loadOpen(db, tournamentId)
  if (t.started_at || ['active', 'completed'].includes(t.status)) throw badRequest('The bracket has been made. Ask the staff to withdraw you')
  const { data, error } = await db
    .from('tournament_entrants').update({ status: 'withdrawn' })
    .eq('tournament_id', tournamentId).eq('user_id', userId).neq('status', 'withdrawn').select('id').maybeSingle()
  if (error) throw fail('Failed to withdraw', error)
  if (!data) throw notFound('You are not registered')
  await promoteWaitlist(db, tournamentId)
  return { message: 'You have been withdrawn' }
}

// ---- teams --------------------------------------------------------------------------------------

async function userByUsername(db: SupabaseClient, username: string): Promise<Row> {
  const { data } = await db.from('user_profiles').select('user_id, username, full_name').ilike('username', escapeLike(username)).maybeSingle()
  if (!data) throw notFound(`No player has the username "${username}"`)
  return data
}

async function loadTeam(db: SupabaseClient, tournamentId: string, teamId: string): Promise<Row> {
  const { data, error } = await db.from('tournament_teams').select('*').eq('id', teamId).eq('tournament_id', tournamentId).maybeSingle()
  if (error) throw fail('Failed to load the team', error)
  if (!data) throw notFound('Team not found')
  return data
}

/** A team takes a place only once everyone has accepted. */
async function enterTeamIfComplete(db: SupabaseClient, t: Row, team: Row): Promise<boolean> {
  const { count } = await db.from('tournament_team_members').select('user_id', { count: 'exact', head: true }).eq('team_id', team.id).eq('status', 'accepted')
  if ((count ?? 0) < t.team_size) return false
  const { data: fresh } = await db.from('tournament_overview').select('registered_count, max_players').eq('id', t.id).maybeSingle()
  const row = entrantRow({ ...t, ...(fresh ?? {}) }, { team_id: team.id, display_name: team.name })
  const { error } = await db.from('tournament_entrants').insert(row)
  if (error && error.code !== '23505') throw fail('Failed to register the team', error)
  return true
}

function assertTeamTournament(t: Row) {
  if (t.team_size < 2) throw badRequest('This is a solo tournament')
}

export async function createTeam(userId: string, tournamentId: string, input: z.infer<typeof teamSchema>, db: SupabaseClient = getSupabase()) {
  const t = await loadOpen(db, tournamentId)
  assertRegistrationOpen(t)
  assertTeamTournament(t)
  const usernames = Array.from(new Set(input.usernames.map((u) => u.toLowerCase())))
  if (usernames.length > t.team_size - 1) throw badRequest(`A team has ${t.team_size} players including you, so invite at most ${t.team_size - 1}`)

  const invitees: Row[] = []
  for (const name of usernames) {
    const p = await userByUsername(db, name)
    if (p.user_id === userId) throw badRequest('You are already on your own team')
    invitees.push(p)
  }

  const { data: team, error } = await db.from('tournament_teams').insert({ tournament_id: tournamentId, name: input.name, captain_id: userId }).select().single()
  if (error?.code === '23505') throw badRequest('That team name is taken in this tournament')
  if (error) throw fail('Failed to create the team', error)

  const members = [{ team_id: team.id, tournament_id: tournamentId, user_id: userId, status: 'accepted' }, ...invitees.map((p) => ({ team_id: team.id, tournament_id: tournamentId, user_id: p.user_id, status: 'invited' }))]
  const { error: mErr } = await db.from('tournament_team_members').insert(members)
  if (mErr) {
    await db.from('tournament_teams').delete().eq('id', team.id)
    if (mErr.code === '23505') throw badRequest('You are already on a team in this tournament')
    throw fail('Failed to create the team', mErr)
  }
  const complete = await enterTeamIfComplete(db, t, team)
  return { message: complete ? 'Team registered' : 'Team created. It is entered once everyone accepts', team_id: team.id as string, complete }
}

export async function inviteToTeam(userId: string, tournamentId: string, teamId: string, input: z.infer<typeof inviteSchema>, db: SupabaseClient = getSupabase()) {
  const t = await loadOpen(db, tournamentId)
  assertRegistrationOpen(t)
  const team = await loadTeam(db, tournamentId, teamId)
  if (team.captain_id !== userId) throw new ApiError(403, 'Only the captain can invite players')
  const { count } = await db.from('tournament_team_members').select('user_id', { count: 'exact', head: true }).eq('team_id', teamId)
  if ((count ?? 0) >= t.team_size) throw badRequest('The team is already full')
  const p = await userByUsername(db, input.username)
  const { error } = await db.from('tournament_team_members').insert({ team_id: teamId, tournament_id: tournamentId, user_id: p.user_id, status: 'invited' })
  if (error?.code === '23505') throw badRequest('That player is already on or invited to this team')
  if (error) throw fail('Failed to send the invitation', error)
  return { message: `Invitation sent to ${p.username}` }
}

export async function acceptInvite(userId: string, tournamentId: string, teamId: string, db: SupabaseClient = getSupabase()) {
  const t = await loadOpen(db, tournamentId)
  assertRegistrationOpen(t)
  const team = await loadTeam(db, tournamentId, teamId)
  const { data: invite } = await db.from('tournament_team_members').select('status').eq('team_id', teamId).eq('user_id', userId).maybeSingle()
  if (!invite) throw notFound('No invitation found')
  if (invite.status === 'accepted') throw badRequest('You already accepted')
  const { error } = await db.from('tournament_team_members').update({ status: 'accepted' }).eq('team_id', teamId).eq('user_id', userId)
  if (error?.code === '23505') throw badRequest('You are already on another team in this tournament')
  if (error) throw fail('Failed to accept the invitation', error)
  const complete = await enterTeamIfComplete(db, t, team)
  return { message: complete ? 'You joined. The team is registered' : 'You joined the team', complete }
}

/** A member declines or leaves; the captain leaving disbands the team. Only before the bracket exists. */
export async function leaveTeam(userId: string, tournamentId: string, teamId: string, db: SupabaseClient = getSupabase()) {
  const t = await loadOpen(db, tournamentId)
  if (t.started_at || ['active', 'completed'].includes(t.status)) throw badRequest('The bracket has been made. Ask the staff')
  const team = await loadTeam(db, tournamentId, teamId)
  if (team.captain_id === userId) {
    const { error } = await db.from('tournament_teams').delete().eq('id', teamId)
    if (error) throw fail('Failed to disband the team', error)
    await promoteWaitlist(db, tournamentId)
    return { message: 'Team disbanded' }
  }
  const { data, error } = await db.from('tournament_team_members').delete().eq('team_id', teamId).eq('user_id', userId).select('user_id').maybeSingle()
  if (error) throw fail('Failed to leave the team', error)
  if (!data) throw notFound('You are not on this team')
  // an incomplete team no longer holds a place
  await db.from('tournament_entrants').delete().eq('team_id', teamId)
  await promoteWaitlist(db, tournamentId)
  return { message: 'You left the team' }
}

/** Pending invitations for a player across tournaments that are still open. */
export async function myInvitations(userId: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('tournament_team_members').select('team_id, tournament_id').eq('user_id', userId).eq('status', 'invited')
  if (error) throw fail('Failed to load invitations', error)
  const out = []
  for (const m of (data ?? []) as Row[]) {
    const [{ data: team }, { data: t }] = await Promise.all([
      db.from('tournament_teams').select('name, captain_id').eq('id', m.team_id).maybeSingle(),
      db.from('tournament_overview').select('id, name, status, started_at').eq('id', m.tournament_id).maybeSingle(),
    ])
    if (!team || !t || t.status !== 'open' || t.started_at) continue
    out.push({ team_id: m.team_id, team_name: team.name, tournament_id: t.id, tournament_name: t.name, captain: await profileName(db, team.captain_id) })
  }
  return out
}
