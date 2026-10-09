import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest, notFound } from '../../http'
import { getSupabase } from '../../supabase'
import { fromIstString } from '../../time'
import {
  computeStandings, generateRoundRobin, generateSingleElimination, roundName, shuffle, totalRounds, type GeneratedMatch,
} from '../../tournaments/engine'
import { mapRpcError } from '../bookings'

// ---- shared -------------------------------------------------------------------------------------

/** Database error codes (raised by sql/setup/08_tournaments.sql) -> status and message. */
export const TOURNAMENT_ERRORS: Record<string, [number, string]> = {
  TOURNAMENT_NOT_FOUND: [404, 'Tournament not found'],
  TOURNAMENT_COMPLETED: [400, 'This tournament is finished'],
  ALREADY_STARTED: [400, 'A match has already been played. Undo the results before changing the bracket'],
  NO_MATCHES: [400, 'There are no matches to save'],
  INVALID_ENTRANT: [400, 'Every entrant must be registered or checked in'],
  MATCH_NOT_FOUND: [404, 'Match not found'],
  NOT_ACTIVE: [400, 'The tournament is not running'],
  BYE_MATCH: [400, 'A bye has no result'],
  ALREADY_COMPLETED: [400, 'This match already has a result. Undo it first'],
  MATCH_NOT_READY: [400, 'Both sides must be known before a result can be entered'],
  INVALID_SCORE: [400, 'Enter both scores, or neither'],
  INVALID_WINNER: [400, 'The winner must be one of the two entrants'],
  SCORE_MISMATCH: [400, 'The winner must have the higher score'],
  DRAW_NOT_ALLOWED: [400, 'A knockout match cannot end in a draw'],
  WINNER_REQUIRED: [400, 'Choose a winner or enter the scores'],
  NOT_COMPLETED: [400, 'This match has no result to undo'],
  NEXT_MATCH_STARTED: [400, 'The next match has already been played. Undo that result first'],
}

const fail = (msg: string, error: unknown) => {
  console.error(`${msg}:`, error)
  return new ApiError(500, msg)
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

const uuid = z.guid()

/** <input type="datetime-local"> sends "2030-01-01T18:30" with no zone; the café's clock is IST. */
const instant = z
  .string()
  .trim()
  .transform((v, ctx) => {
    try {
      const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)
      const d = hasZone ? new Date(v) : fromIstString(v.replace('T', ' '))
      if (Number.isNaN(d.getTime())) throw new Error('bad date')
      return d.toISOString()
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid date and time' })
      return z.NEVER
    }
  })

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const TERMINAL = ['withdrawn', 'disqualified']
const PLAYING = ['registered', 'checked_in']

async function loadTournament(db: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await db.from('tournament_overview').select('*').eq('id', id).maybeSingle()
  if (error) throw fail('Failed to load the tournament', error)
  if (!data) throw notFound('Tournament not found')
  return data
}

const hasStarted = (t: Row) => t.started_at !== null || ['active', 'completed'].includes(t.status)

// ---- create / edit / status ---------------------------------------------------------------------

const settings = {
  name: z.string().trim().min(1).max(100),
  game: z.string().trim().min(1).max(100),
  platform: z.enum(['PC', 'PS5']),
  max_players: z.number().int().min(2).max(256),
  tournament_type: z.enum(['knockout', 'league']),
  team_size: z.number().int().min(1).max(10),
  best_of: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]),
  third_place_match: z.boolean(),
  double_round_robin: z.boolean(),
  seeding: z.enum(['random', 'manual']),
  entry_fee: z.number().finite().min(0).max(1_000_000),
  prize_pool: z.number().finite().min(0).max(100_000_000),
  prize_details: z.string().trim().max(1000).nullable(),
  rules: z.string().trim().max(5000).nullable(),
  description: z.string().trim().max(2000).nullable(),
  banner_image: z.string().trim().max(500).nullable(),
  starts_at: instant.nullable(),
  registration_closes_at: instant.nullable(),
}

export const tournamentSchema = z.object({
  name: settings.name,
  game: settings.game,
  platform: settings.platform,
  max_players: settings.max_players,
  tournament_type: settings.tournament_type,
  team_size: settings.team_size.default(1),
  best_of: settings.best_of.default(1),
  third_place_match: settings.third_place_match.default(false),
  double_round_robin: settings.double_round_robin.default(false),
  seeding: settings.seeding.default('random'),
  entry_fee: settings.entry_fee.default(0),
  prize_pool: settings.prize_pool.default(0),
  prize_details: settings.prize_details.optional(),
  rules: settings.rules.optional(),
  description: settings.description.default(''),
  banner_image: settings.banner_image.default(''),
  starts_at: settings.starts_at.optional(),
  registration_closes_at: settings.registration_closes_at.optional(),
})
export type TournamentInput = z.infer<typeof tournamentSchema>

export const tournamentUpdateSchema = z.object(settings).partial()

export const tournamentStatusQuery = z.object({ status: z.enum(['draft', 'open', 'paused', 'active', 'completed']) })

export async function listTournaments(db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('tournament_overview').select('*').order('created_at', { ascending: false })
  if (error) throw fail('Failed to load tournaments', error)
  return data ?? []
}

export async function createTournament(input: TournamentInput, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.from('tournaments').insert(input).select('id').single()
  if (error) throw fail('Failed to create tournament', error)
  return { message: 'Tournament created successfully', id: data.id as string }
}

/** Settings that decide how the bracket is built cannot change once it exists. */
const STRUCTURAL = ['tournament_type', 'team_size', 'best_of', 'third_place_match', 'double_round_robin', 'seeding', 'max_players'] as const

export async function updateTournament(id: string, input: z.infer<typeof tournamentUpdateSchema>, db: SupabaseClient = getSupabase()) {
  const t = await loadTournament(db, id)
  const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
  if (Object.keys(changes).length === 0) throw badRequest('Nothing to update')

  if (hasStarted(t)) {
    const locked = STRUCTURAL.filter((k) => k in changes && changes[k] !== t[k])
    if (locked.length) throw badRequest(`Cannot change ${locked.join(', ')} after the bracket has been generated`)
  }
  if (typeof changes.max_players === 'number' && changes.max_players < t.registered_count) {
    throw badRequest(`${t.registered_count} entrants are already registered; remove some before lowering the limit`)
  }
  const { data, error } = await db.from('tournaments').update(changes).eq('id', id).select('id').maybeSingle()
  if (error) throw fail('Failed to update the tournament', error)
  if (!data) throw notFound('Tournament not found')
  if (typeof changes.max_players === 'number') await promoteWaitlist(db, id)
  return { message: 'Tournament updated' }
}

/** Moves between "set up", "taking registrations", "paused" and (once a bracket exists) "running". Finishing happens by playing. */
const TRANSITIONS: Record<string, string[]> = {
  draft: ['open'],
  open: ['draft', 'paused'],
  paused: ['open', 'active'],
  active: ['paused'],
  completed: [],
}

export async function setTournamentStatus(id: string, status: string, db: SupabaseClient = getSupabase()) {
  const t = await loadTournament(db, id)
  if (t.status === status) return { message: `Tournament status updated to ${status}` }
  if (!TRANSITIONS[t.status]?.includes(status)) {
    throw badRequest(status === 'active' || status === 'completed'
      ? 'A tournament starts when the bracket is generated and finishes when its last match is played'
      : `A ${t.status} tournament cannot be set to ${status}`)
  }
  if (status === 'active' && !t.started_at) throw badRequest('Generate the bracket to start the tournament')
  if (status === 'open' && t.started_at) throw badRequest('Registration cannot reopen after the bracket has been generated')
  const { error } = await db.from('tournaments').update({ status }).eq('id', id)
  if (error) throw fail('Failed to update the tournament', error)
  if (status === 'open') await promoteWaitlist(db, id)
  return { message: `Tournament status updated to ${status}` }
}

export async function deleteTournament(id: string, db: SupabaseClient = getSupabase()) {
  const t = await loadTournament(db, id)
  if (t.status === 'active') throw badRequest('A running tournament cannot be deleted. Pause it first, or let it finish')
  const { error } = await db.from('tournaments').delete().eq('id', id)
  if (error) throw fail('Failed to delete the tournament', error)
  return { message: 'Tournament deleted' }
}

// ---- entrants -----------------------------------------------------------------------------------

export const addEntrantSchema = z
  .object({ display_name: z.string().trim().min(1).max(60).optional(), username: z.string().trim().min(1).max(30).optional() })
  .refine((v) => v.display_name || v.username, 'Enter a name or a username')

export const updateEntrantSchema = z
  .object({
    status: z.enum(['registered', 'waitlist', 'checked_in', 'withdrawn', 'disqualified']).optional(),
    payment_status: z.enum(['NOT_REQUIRED', 'PENDING', 'PAID']).optional(),
    display_name: z.string().trim().min(1).max(60).optional(),
    seed: z.number().int().min(1).max(1024).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')

/** Players who got a place because someone left are promoted from the waitlist, oldest first. */
export async function promoteWaitlist(db: SupabaseClient, tournamentId: string): Promise<number> {
  const t = await loadTournament(db, tournamentId)
  if (hasStarted(t)) return 0
  const free = t.max_players - t.registered_count
  if (free <= 0 || t.waitlist_count === 0) return 0
  const { data, error } = await db
    .from('tournament_entrants')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'waitlist')
    .order('registered_at')
    .limit(free)
  if (error || !data?.length) return 0
  const { error: updateError } = await db.from('tournament_entrants').update({ status: 'registered' }).in('id', data.map((r) => r.id))
  if (updateError) throw fail('Failed to promote from the waitlist', updateError)
  return data.length
}

export async function addEntrant(tournamentId: string, input: z.infer<typeof addEntrantSchema>, db: SupabaseClient = getSupabase()) {
  const t = await loadTournament(db, tournamentId)
  if (hasStarted(t)) throw badRequest('Entrants cannot be added after the bracket has been generated')

  let userId: string | null = null
  let name = input.display_name
  if (input.username) {
    const { data: profile } = await db
      .from('user_profiles')
      .select('user_id, username, full_name')
      .ilike('username', escapeLike(input.username))
      .maybeSingle()
    if (!profile) throw notFound('No player has that username')
    userId = profile.user_id
    name = name ?? profile.full_name ?? profile.username
  }

  const { data, error } = await db
    .from('tournament_entrants')
    .insert({
      tournament_id: tournamentId,
      user_id: userId,
      display_name: name,
      status: t.registered_count >= t.max_players ? 'waitlist' : 'registered',
      payment_status: Number(t.entry_fee) > 0 ? 'PENDING' : 'NOT_REQUIRED',
    })
    .select()
    .single()
  if (error?.code === '23505') throw badRequest('That player is already registered')
  if (error) throw fail('Failed to add the entrant', error)
  return data
}

async function loadEntrant(db: SupabaseClient, tournamentId: string, entrantId: string): Promise<Row> {
  const { data, error } = await db.from('tournament_entrants').select('*').eq('id', entrantId).eq('tournament_id', tournamentId).maybeSingle()
  if (error) throw fail('Failed to load the entrant', error)
  if (!data) throw notFound('Entrant not found')
  return data
}

export async function updateEntrant(
  tournamentId: string, entrantId: string, input: z.infer<typeof updateEntrantSchema>, db: SupabaseClient = getSupabase(),
) {
  const [t, entrant] = await Promise.all([loadTournament(db, tournamentId), loadEntrant(db, tournamentId, entrantId)])
  const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
  const started = hasStarted(t)

  if (started) {
    if ('seed' in changes) throw badRequest('Seeds cannot change after the bracket has been generated')
    if (changes.status && changes.status !== entrant.status && !TERMINAL.includes(changes.status as string)) {
      throw badRequest('After the bracket is generated an entrant can only withdraw or be disqualified')
    }
  }
  if (changes.status && PLAYING.includes(changes.status as string) && !PLAYING.includes(entrant.status) && t.registered_count >= t.max_players) {
    throw badRequest('The tournament is full')
  }

  const { data, error } = await db.from('tournament_entrants').update(changes).eq('id', entrantId).select().maybeSingle()
  if (error) throw fail('Failed to update the entrant', error)
  if (!data) throw notFound('Entrant not found')

  if (changes.status && TERMINAL.includes(changes.status as string) && !TERMINAL.includes(entrant.status)) {
    if (started) await settleForfeits(db, tournamentId)
    else await promoteWaitlist(db, tournamentId)
  }
  return data
}

export async function removeEntrant(tournamentId: string, entrantId: string, db: SupabaseClient = getSupabase()) {
  const t = await loadTournament(db, tournamentId)
  if (hasStarted(t)) throw badRequest('After the bracket is generated, withdraw or disqualify the entrant instead')
  await loadEntrant(db, tournamentId, entrantId)
  const { error } = await db.from('tournament_entrants').delete().eq('id', entrantId)
  if (error) throw fail('Failed to remove the entrant', error)
  await promoteWaitlist(db, tournamentId)
  return { message: 'Entrant removed' }
}

// ---- bracket ------------------------------------------------------------------------------------

export const bracketSchema = z.object({ order: z.array(uuid).max(1024).optional() }).default({})

const byRegistration = (a: Row, b: Row) =>
  (a.seed ?? Infinity) - (b.seed ?? Infinity) || String(a.registered_at).localeCompare(String(b.registered_at))

/** Works out the seeding and matches for a tournament without saving anything. */
async function planBracket(db: SupabaseClient, tournamentId: string, order?: string[]) {
  const t = await loadTournament(db, tournamentId)
  if (t.status === 'completed') throw badRequest('This tournament is finished')
  const { data, error } = await db.from('tournament_entrants').select('*').eq('tournament_id', tournamentId).in('status', PLAYING)
  if (error) throw fail('Failed to load the entrants', error)
  const entrants = (data ?? []) as Row[]
  if (entrants.length < 2) throw badRequest('At least 2 registered entrants are needed to make a bracket')

  const ids = entrants.map((e) => e.id as string)
  let ordered: string[]
  if (order) {
    if (order.length !== ids.length || new Set(order).size !== order.length || order.some((id) => !ids.includes(id))) {
      throw badRequest('The order must list every registered entrant exactly once')
    }
    ordered = order
  } else if (t.seeding === 'manual') {
    ordered = entrants.slice().sort(byRegistration).map((e) => e.id)
  } else {
    ordered = shuffle(ids)
  }

  const matches =
    t.tournament_type === 'knockout'
      ? generateSingleElimination(ordered, { bestOf: t.best_of, thirdPlace: t.third_place_match })
      : generateRoundRobin(ordered, { bestOf: t.best_of, doubleRound: t.double_round_robin })
  return { t, entrants, ordered, matches }
}

function describeMatches(t: Row, matches: GeneratedMatch[], names: Map<string, string>) {
  const rounds = totalRounds(matches)
  return matches.map((m) => ({
    ...m,
    entrant1_name: m.entrant1_id ? names.get(m.entrant1_id) ?? null : null,
    entrant2_name: m.entrant2_id ? names.get(m.entrant2_id) ?? null : null,
    winner_name: m.winner_id ? names.get(m.winner_id) ?? null : null,
    round_name: t.tournament_type === 'knockout' ? roundName(m.round, rounds, m.bracket) : `Round ${m.round}`,
  }))
}

export async function previewBracket(tournamentId: string, order: string[] | undefined, db: SupabaseClient = getSupabase()) {
  const { t, entrants, ordered, matches } = await planBracket(db, tournamentId, order)
  const names = new Map(entrants.map((e) => [e.id as string, e.display_name as string]))
  return {
    order: ordered.map((id, i) => ({ id, seed: i + 1, display_name: names.get(id) })),
    rounds: totalRounds(matches),
    matches: describeMatches(t, matches, names),
  }
}

export async function startBracket(tournamentId: string, order: string[] | undefined, db: SupabaseClient = getSupabase()) {
  const { ordered, matches } = await planBracket(db, tournamentId, order)
  const { error } = await db.rpc('save_bracket', {
    p_tournament_id: tournamentId,
    p_matches: matches,
    p_seeds: ordered.map((id, i) => ({ id, seed: i + 1 })),
  })
  if (error) throw mapRpcError(error, 'Failed to generate the bracket', TOURNAMENT_ERRORS)
  return getTournamentDetail(tournamentId, db)
}

// ---- results ------------------------------------------------------------------------------------

export const resultSchema = z.object({
  score1: z.number().int().min(0).max(999).nullish(),
  score2: z.number().int().min(0).max(999).nullish(),
  winner_id: uuid.nullish(),
  walkover: z.boolean().default(false),
})

export const matchUpdateSchema = z
  .object({
    status: z.enum(['ready', 'live']).optional(),
    scheduled_at: instant.nullable().optional(),
    station_id: uuid.nullable().optional(),
    notes: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')

interface ForfeitMatch { id: string; round: number; position: number; entrant1_id: string | null; entrant2_id: string | null }

/**
 * When an entrant has withdrawn or been disqualified, every match they are due to play is awarded to the other side.
 * If both are out the better seed gets it so the bracket can still move on. Returns null when nothing is left to settle.
 */
export function findForfeit(matches: ForfeitMatch[], out: Map<string, number | null>): { matchId: string; winnerId: string } | null {
  const sorted = matches.slice().sort((a, b) => a.round - b.round || a.position - b.position)
  for (const m of sorted) {
    const a = m.entrant1_id
    const b = m.entrant2_id
    if (!a || !b) continue
    const aOut = out.has(a)
    const bOut = out.has(b)
    if (aOut && !bOut) return { matchId: m.id, winnerId: b }
    if (bOut && !aOut) return { matchId: m.id, winnerId: a }
    if (aOut && bOut) return { matchId: m.id, winnerId: (out.get(a) ?? Infinity) <= (out.get(b) ?? Infinity) ? a : b }
  }
  return null
}

export async function settleForfeits(db: SupabaseClient, tournamentId: string): Promise<{ settled: number; completed: boolean }> {
  const t = await loadTournament(db, tournamentId)
  if (t.status !== 'active') return { settled: 0, completed: false }
  const { data: gone } = await db
    .from('tournament_entrants').select('id, seed').eq('tournament_id', tournamentId).in('status', TERMINAL)
  if (!gone?.length) return { settled: 0, completed: false }
  const out = new Map<string, number | null>(gone.map((e) => [e.id as string, e.seed as number | null]))

  let settled = 0
  let completed = false
  for (let i = 0; i < 1000; i++) {
    const { data: open } = await db
      .from('tournament_matches')
      .select('id, round, position, entrant1_id, entrant2_id')
      .eq('tournament_id', tournamentId)
      .in('status', ['ready', 'live'])
    const next = findForfeit((open ?? []) as ForfeitMatch[], out)
    if (!next) break
    const { data, error } = await db.rpc('report_match_result', {
      p_match_id: next.matchId, p_score1: null, p_score2: null, p_winner: next.winnerId, p_walkover: true,
    })
    if (error) throw mapRpcError(error, 'Failed to settle a forfeit', TOURNAMENT_ERRORS)
    settled++
    if (data?.tournament_completed) { completed = true; break }
  }
  if (completed) await finalizeLeague(db, tournamentId)
  return { settled, completed }
}

/** A finished league has no final to read the champion from; take it from the table. */
export async function finalizeLeague(db: SupabaseClient, tournamentId: string): Promise<string | null> {
  const t = await loadTournament(db, tournamentId)
  if (t.tournament_type !== 'league' || t.status !== 'completed' || t.champion_entrant_id) return t.champion_entrant_id ?? null
  const [entrants, matches] = await Promise.all([
    db.from('tournament_entrants').select('id, seed, registered_at').eq('tournament_id', tournamentId),
    db.from('tournament_matches').select('entrant1_id, entrant2_id, score1, score2, winner_id, status').eq('tournament_id', tournamentId),
  ])
  const ids = ((entrants.data ?? []) as Row[]).sort(byRegistration).map((e) => e.id as string)
  const table = computeStandings(ids, (matches.data ?? []) as never[])
  const champion = table[0]?.entrant_id ?? null
  if (champion) await db.from('tournaments').update({ champion_entrant_id: champion }).eq('id', tournamentId)
  return champion
}

async function tournamentOfMatch(db: SupabaseClient, matchId: string): Promise<Row> {
  const { data, error } = await db.from('tournament_matches').select('id, tournament_id, status').eq('id', matchId).maybeSingle()
  if (error) throw fail('Failed to load the match', error)
  if (!data) throw notFound('Match not found')
  return data
}

export async function reportResult(matchId: string, input: z.infer<typeof resultSchema>, db: SupabaseClient = getSupabase()) {
  const match = await tournamentOfMatch(db, matchId)
  const { data, error } = await db.rpc('report_match_result', {
    p_match_id: matchId,
    p_score1: input.score1 ?? null,
    p_score2: input.score2 ?? null,
    p_winner: input.winner_id ?? null,
    p_walkover: input.walkover,
  })
  if (error) throw mapRpcError(error, 'Failed to save the result', TOURNAMENT_ERRORS)

  let completed = Boolean(data?.tournament_completed)
  if (completed) await finalizeLeague(db, match.tournament_id)
  else {
    const forfeits = await settleForfeits(db, match.tournament_id)
    completed = forfeits.completed
  }
  return { ...data, tournament_completed: completed }
}

export async function undoResult(matchId: string, db: SupabaseClient = getSupabase()) {
  await tournamentOfMatch(db, matchId)
  const { data, error } = await db.rpc('undo_match_result', { p_match_id: matchId })
  if (error) throw mapRpcError(error, 'Failed to undo the result', TOURNAMENT_ERRORS)
  return data
}

export async function updateMatch(matchId: string, input: z.infer<typeof matchUpdateSchema>, db: SupabaseClient = getSupabase()) {
  const match = await tournamentOfMatch(db, matchId)
  const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
  if (changes.status === 'live' && match.status !== 'ready') throw badRequest('Only a match with both sides known can go live')
  if (changes.status === 'ready' && match.status !== 'live') throw badRequest('Only a live match can be set back to ready')
  const { data, error } = await db.from('tournament_matches').update(changes).eq('id', matchId).select().maybeSingle()
  if (error?.code === '23503') throw badRequest('That station does not exist')
  if (error) throw fail('Failed to update the match', error)
  return data
}

// ---- detail -------------------------------------------------------------------------------------

/** Everything the manage screen needs in one call: settings, live counts, entrants (with team members), matches and standings. */
export async function getTournamentDetail(tournamentId: string, db: SupabaseClient = getSupabase()) {
  const t = await loadTournament(db, tournamentId)
  const [entrantsRes, matchesRes] = await Promise.all([
    db.from('tournament_entrants').select('*').eq('tournament_id', tournamentId),
    db.from('tournament_matches').select('*').eq('tournament_id', tournamentId).order('round').order('position'),
  ])
  if (entrantsRes.error || matchesRes.error) throw fail('Failed to load the tournament', entrantsRes.error ?? matchesRes.error)
  const entrants = ((entrantsRes.data ?? []) as Row[]).sort(byRegistration)
  const matches = (matchesRes.data ?? []) as Row[]

  // team members, for team entrants
  const teamIds = entrants.map((e) => e.team_id).filter(Boolean) as string[]
  const membersByTeam = new Map<string, { user_id: string; name: string; status: string }[]>()
  if (teamIds.length) {
    const { data: members } = await db.from('tournament_team_members').select('team_id, user_id, status').in('team_id', teamIds)
    const userIds = Array.from(new Set((members ?? []).map((m) => m.user_id as string)))
    const { data: profiles } = userIds.length
      ? await db.from('user_profiles').select('user_id, username, full_name').in('user_id', userIds)
      : { data: [] as Row[] }
    const nameOf = new Map((profiles ?? []).map((p) => [p.user_id as string, (p.full_name || p.username) as string]))
    for (const m of members ?? []) {
      membersByTeam.set(m.team_id, [...(membersByTeam.get(m.team_id) ?? []), { user_id: m.user_id, name: nameOf.get(m.user_id) ?? 'Player', status: m.status }])
    }
  }

  const names = new Map(entrants.map((e) => [e.id as string, e.display_name as string]))
  const rounds = totalRounds(matches as never[])
  const described = matches.map((m) => ({
    ...m,
    entrant1_name: m.entrant1_id ? names.get(m.entrant1_id) ?? null : null,
    entrant2_name: m.entrant2_id ? names.get(m.entrant2_id) ?? null : null,
    winner_name: m.winner_id ? names.get(m.winner_id) ?? null : null,
    round_name: t.tournament_type === 'knockout' ? roundName(m.round, rounds, m.bracket) : `Round ${m.round}`,
  }))

  const standings =
    t.tournament_type === 'league' && matches.length
      ? computeStandings(entrants.filter((e) => matches.some((m) => m.entrant1_id === e.id || m.entrant2_id === e.id)).map((e) => e.id), matches as never[])
          .map((row) => ({ ...row, display_name: names.get(row.entrant_id) ?? null }))
      : []

  return {
    tournament: t,
    entrants: entrants.map((e) => ({ ...e, team_members: e.team_id ? membersByTeam.get(e.team_id) ?? [] : [] })),
    matches: described,
    rounds,
    standings,
    champion_name: t.champion_entrant_id ? names.get(t.champion_entrant_id) ?? null : null,
  }
}
