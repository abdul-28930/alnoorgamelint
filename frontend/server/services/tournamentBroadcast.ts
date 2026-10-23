import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest, notFound } from '../http'
import { getSupabase } from '../supabase'
import { getWhatsappConfig, normalizePhone } from '../whatsapp/client'
import { deliverQueued, enqueue, notify, type Deps } from './notifications'
import { recipientsFor } from './tournamentNotifications'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export const MAX_RECIPIENTS = 300
const PLAYING = ['registered', 'checked_in']

export const audienceSchema = z.enum(['registered', 'checked_in', 'waitlist', 'no_show', 'round'])
export type Audience = z.infer<typeof audienceSchema>

const needsRound = (v: { audience: Audience; round?: number }) => v.audience !== 'round' || v.round !== undefined

export const previewQuery = z
  .object({ audience: audienceSchema, round: z.coerce.number().int().min(1).max(20).optional() })
  .refine(needsRound, { message: 'Choose a round', path: ['round'] })

export const broadcastSchema = z
  .object({
    audience: audienceSchema,
    round: z.number().int().min(1).max(20).optional(),
    message: z.string().trim().min(1, 'Write a message').max(200, 'The message can be 200 characters at most'),
    /** made by the screen once per send: pressing the button twice cannot send twice */
    batch_id: z.guid(),
  })
  .refine(needsRound, { message: 'Choose a round', path: ['round'] })

export const continueSchema = z.object({ batch_id: z.guid() })

async function loadTournament(db: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await db.from('tournament_overview').select('id, name').eq('id', id).maybeSingle()
  if (error) throw new ApiError(500, 'Failed to load the tournament')
  if (!data) throw notFound('Tournament not found')
  return data
}

/** The entrants a group of staff means by "all registered", "no-shows", "players still to play in round 2"... */
export async function audienceEntrantIds(db: SupabaseClient, tournamentId: string, audience: Audience, round?: number): Promise<string[]> {
  if (audience === 'round') {
    const { data, error } = await db.from('tournament_matches').select('entrant1_id, entrant2_id, status').eq('tournament_id', tournamentId).eq('round', round ?? 0)
    if (error) throw new ApiError(500, 'Failed to load the matches')
    const ids = new Set<string>()
    for (const m of (data ?? []) as Row[]) {
      if (m.status === 'completed' || m.status === 'bye') continue // only players who still have to play
      if (m.entrant1_id) ids.add(m.entrant1_id)
      if (m.entrant2_id) ids.add(m.entrant2_id)
    }
    return Array.from(ids)
  }
  const { data, error } = await db.from('tournament_entrants').select('id, status, no_show').eq('tournament_id', tournamentId)
  if (error) throw new ApiError(500, 'Failed to load the entrants')
  const rows = (data ?? []) as Row[]
  const pick = (e: Row) =>
    audience === 'registered' ? PLAYING.includes(e.status)
    : audience === 'checked_in' ? e.status === 'checked_in'
    : audience === 'waitlist' ? e.status === 'waitlist'
    : PLAYING.includes(e.status) && e.no_show === true // no_show
  return rows.filter(pick).map((e) => e.id as string)
}

export async function previewBroadcast(tournamentId: string, q: z.infer<typeof previewQuery>, db: SupabaseClient = getSupabase()) {
  await loadTournament(db, tournamentId)
  const ids = await audienceEntrantIds(db, tournamentId, q.audience, q.round)
  const { recipients } = ids.length ? await recipientsFor(db, tournamentId, ids) : { recipients: [] }
  const withNumber = recipients.filter((r) => normalizePhone(r.phone)).length
  return {
    entrants: ids.length,
    people: recipients.length,
    with_number: withNumber,
    without_number: recipients.length - withNumber,
    sample: Array.from(new Set(recipients.map((r) => r.name))).slice(0, 5),
  }
}

const prefixOf = (tournamentId: string, batchId: string) => `tournament:${tournamentId}:update:${batchId}:`

/** What has happened to every message of one send so far. */
async function batchTotals(db: SupabaseClient, prefix: string) {
  const like = `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { data } = await db.from('notification_log').select('status').like('dedupe_key', like)
  const totals = { pending: 0, sent: 0, failed: 0, unconfirmed: 0, skipped: 0 }
  for (const r of (data ?? []) as Row[]) if (r.status in totals) totals[r.status as keyof typeof totals]++
  return totals
}

/**
 * Staff press "Send notification": every person is prepared and waiting, then the first few go out. The screen keeps
 * calling `continueBroadcast` until nothing is waiting, so a big group never runs into the time limit (and a closed tab
 * is finished by the scheduled job).
 */
export async function startBroadcast(
  tournamentId: string, input: z.infer<typeof broadcastSchema>, sentBy: string, db: SupabaseClient = getSupabase(), deps: Deps = {},
) {
  if ((deps.cfg === undefined ? getWhatsappConfig() : deps.cfg) === null) throw badRequest('WhatsApp is not configured. Set the keys on the server first.')
  const t = await loadTournament(db, tournamentId)
  const ids = await audienceEntrantIds(db, tournamentId, input.audience, input.round)
  const { recipients } = ids.length ? await recipientsFor(db, tournamentId, ids) : { recipients: [] }
  if (!recipients.length) throw badRequest('Nobody to send to: that group has no players with an account')
  if (recipients.length > MAX_RECIPIENTS) throw badRequest(`That is ${recipients.length} people. Send to a smaller group (at most ${MAX_RECIPIENTS}).`)

  const prefix = prefixOf(tournamentId, input.batch_id)
  const withDb: Deps = { ...deps, db }
  let prepared = 0
  for (let i = 0; i < recipients.length; i += 10) {
    const results = await Promise.all(
      recipients.slice(i, i + 10).map((r) =>
        enqueue({
          event: 'tournament_update', phone: r.phone, name: r.name, userId: r.userId, urlParam: tournamentId, sentBy,
          vars: { name: r.name, tournament: t.name, message: input.message },
          dedupeKey: `${prefix}${r.userId}`,
          refs: { tournament_id: tournamentId, entrant_id: r.entrant.id as string },
        }, withDb),
      ),
    )
    prepared += results.filter((r) => r.status === 'queued').length
  }
  const progress = prepared ? await deliverQueued(prefix, withDb) : { sent: 0, failed: 0, unconfirmed: 0, remaining: 0 }
  return { batch_id: input.batch_id, people: recipients.length, ...progress, totals: await batchTotals(db, prefix) }
}

export async function continueBroadcast(tournamentId: string, batchId: string, db: SupabaseClient = getSupabase(), deps: Deps = {}) {
  await loadTournament(db, tournamentId)
  const prefix = prefixOf(tournamentId, batchId)
  const progress = await deliverQueued(prefix, { ...deps, db })
  return { batch_id: batchId, ...progress, totals: await batchTotals(db, prefix) }
}

/** "Call player": tells both players of a match that it is coming up. Pressing it again within 5 minutes sends nothing new. */
export async function callMatchPlayers(matchId: string, sentBy: string, db: SupabaseClient = getSupabase(), deps: Deps = {}) {
  const { data: m, error } = await db.from('tournament_matches').select('id, tournament_id, status, entrant1_id, entrant2_id').eq('id', matchId).maybeSingle()
  if (error) throw new ApiError(500, 'Failed to load the match')
  if (!m) throw notFound('Match not found')
  if (m.status === 'completed' || m.status === 'bye') throw badRequest('That match does not need a call')
  const ids = [m.entrant1_id, m.entrant2_id].filter(Boolean) as string[]
  if (!ids.length) throw badRequest('The players for this match are not known yet')

  const t = await loadTournament(db, m.tournament_id as string)
  const { recipients } = await recipientsFor(db, m.tournament_id as string, ids)
  if (!recipients.length) throw badRequest('These players have no WhatsApp number on file')
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000))
  const results = await Promise.all(
    recipients.map(async (r) => {
      const out = await notify({
        event: 'match_call', phone: r.phone, name: r.name, userId: r.userId, sentBy,
        vars: { name: r.name, tournament: t.name },
        dedupeKey: `match:${matchId}:${r.userId}:call:${bucket}`,
        refs: { tournament_id: m.tournament_id as string, entrant_id: r.entrant.id as string },
      }, { ...deps, db })
      return { name: r.name, status: out.status, detail: out.detail }
    }),
  )
  return { called: results }
}
