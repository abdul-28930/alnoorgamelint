import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, badRequest, notFound } from '../http'
import { getSupabase } from '../supabase'

export async function registerForTournament(userId: string, tournamentId: string, db: SupabaseClient = getSupabase()) {
  const { data: t } = await db.from('tournaments').select('id, max_players').eq('id', tournamentId).eq('status', 'open').maybeSingle()
  if (!t) throw notFound('Tournament not found or not open')

  const { count } = await db.from('tournament_registrations').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId)
  if ((count ?? 0) >= t.max_players) throw badRequest('Tournament is full')

  // The unique (tournament_id, user_id) constraint makes double registration safe under races.
  const { error } = await db.from('tournament_registrations').insert({ tournament_id: tournamentId, user_id: userId })
  if (error?.code === '23505') throw badRequest('Already registered')
  if (error) throw new ApiError(500, 'Failed to register')
  return { message: 'Registered successfully' }
}
