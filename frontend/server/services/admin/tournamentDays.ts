import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest, notFound } from '../../http'
import { getSupabase } from '../../supabase'
import { planSplit } from '../../tournaments/engine'
import { mapRpcError } from '../bookings'
import { loadTournament, promoteWaitlist } from './tournaments'

export const splitSchema = z.object({
  method: z.enum(['first', 'alternate', 'random']).default('first'),
  days: z.number().int().min(2).max(7).default(2),
  /** players per day; default is the tournament's limit divided between the days */
  capacity: z.number().int().min(2).max(256).optional(),
  /** true = only show how the players would be divided */
  preview: z.boolean().default(false),
})

const DAY_ERRORS: Record<string, [number, string]> = {
  NOT_SPLITTABLE: [400, 'This tournament is already split over days, or is itself one day'],
  ALREADY_STARTED: [400, 'The bracket has been generated, so the players can no longer be moved between days'],
  TEAMS_NOT_SUPPORTED: [400, 'Splitting over days works for solo tournaments only'],
  INVALID_DAYS: [400, 'Choose between 2 and 7 days'],
  TOURNAMENT_NOT_FOUND: [404, 'Tournament not found'],
  ENTRANT_NOT_MOVABLE: [400, 'That player is not registered or waiting, so they cannot be moved'],
  NOT_SIBLINGS: [400, 'Players can only be moved to another day of the same tournament'],
}

const missing = (e: { code?: string; message?: string }) => e.code === 'PGRST202' || /could not find the function|column|schema cache/i.test(e.message ?? '')
const needSql = () => new ApiError(503, 'The database is missing the tournament days update. Run sql/setup/21_tournament_days.sql in Supabase, then try again.')

/** Divides the players into days, each its own tournament with its own bracket, waitlist and standings. */
export async function splitTournament(tournamentId: string, input: z.infer<typeof splitSchema>, db: SupabaseClient = getSupabase(), rng: () => number = Math.random) {
  const t = await loadTournament(db, tournamentId)
  if (t.split_days || t.parent_id) throw badRequest(DAY_ERRORS.NOT_SPLITTABLE[1])
  if (t.started_at || ['active', 'completed'].includes(t.status)) throw badRequest(DAY_ERRORS.ALREADY_STARTED[1])
  if (t.team_size > 1) throw badRequest(DAY_ERRORS.TEAMS_NOT_SUPPORTED[1])

  const capacity = input.capacity ?? Math.ceil(t.max_players / input.days)
  const { data: rows, error } = await db.from('tournament_entrants').select('id, status, registered_at').eq('tournament_id', tournamentId)
  if (error) throw new ApiError(500, 'Failed to load the players')
  const plan = planSplit((rows ?? []) as never[], { days: input.days, capacity, method: input.method }, rng)
  const summary = plan.map((d, i) => ({ day: i + 1, name: `${t.name} - Day ${i + 1}`, players: d.active.length, waitlist: d.waitlist.length }))
  if (input.preview) return { preview: true, capacity, days: summary }
  if (plan.every((d) => d.active.length + d.waitlist.length === 0)) throw badRequest('There are no players to split yet')

  const start = t.starts_at ? new Date(t.starts_at).getTime() : null
  const { data, error: rpcError } = await db.rpc('split_tournament_into_days', {
    p_parent_id: tournamentId,
    p_days: plan.map((d, i) => ({
      name: summary[i].name,
      max_players: capacity,
      starts_at: start === null ? null : new Date(start + i * 86_400_000).toISOString(),
      active: d.active,
      waitlist: d.waitlist,
    })),
  })
  if (rpcError) throw missing(rpcError) ? needSql() : mapRpcError(rpcError, 'Failed to split the tournament', DAY_ERRORS)
  const ids = ((data as { days?: string[] } | null)?.days ?? []) as string[]
  return { preview: false, capacity, days: summary.map((s, i) => ({ ...s, id: ids[i] ?? null })) }
}

export const moveSchema = z.object({ to_tournament_id: z.guid('Choose a day') })

/** Staff move one player to another day (joins its waitlist when that day is full); a freed place on the old day goes to its waitlist. */
export async function moveEntrantToDay(entrantId: string, input: z.infer<typeof moveSchema>, db: SupabaseClient = getSupabase()) {
  const { data: entrant } = await db.from('tournament_entrants').select('tournament_id').eq('id', entrantId).maybeSingle()
  if (!entrant) throw notFound('Player not found')
  const { data, error } = await db.rpc('move_entrant_to_day', { p_entrant_id: entrantId, p_to_tournament_id: input.to_tournament_id })
  if (error) throw missing(error) ? needSql() : mapRpcError(error, 'Failed to move the player', DAY_ERRORS)
  await promoteWaitlist(db, entrant.tournament_id as string) // a place opened on the day they left
  return data as { status: string; tournament_id: string }
}
