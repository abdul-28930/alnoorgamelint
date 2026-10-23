import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toIstString } from '../time'
import { isWhatsappConfigured } from '../whatsapp/client'
import { notify, type Deps, type NotifyResult } from './notifications'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "31 Oct 2026 11:00 AM" in IST; "To be announced" when there is no date yet */
export function formatStart(iso: string | null | undefined): string {
  if (!iso) return 'To be announced'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'To be announced'
  const ist = toIstString(d) // YYYY-MM-DD HH:MM:SS
  const hour = Number(ist.slice(11, 13))
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${Number(ist.slice(8, 10))} ${MONTHS[Number(ist.slice(5, 7)) - 1]} ${ist.slice(0, 4)} ${h12}:${ist.slice(14, 16)} ${hour < 12 ? 'AM' : 'PM'}`
}

export type EntrantMessage = 'registered' | 'moved_up'

/**
 * Tells the people behind these entrants (one player, or every accepted member of a team) that they are registered, on the
 * waitlist (with their number), or have just been given a place. Never throws and never blocks the caller: a message that
 * cannot be sent is only logged.
 */
export async function notifyEntrants(
  db: SupabaseClient,
  tournamentId: string,
  entrantIds: string[],
  kind: EntrantMessage,
  deps: Deps = {},
): Promise<NotifyResult[]> {
  if (!entrantIds.length || deps.cfg === null || (deps.cfg === undefined && !isWhatsappConfigured())) return []
  const withDb: Deps = { ...deps, db }
  try {
    const [{ data: t }, { data: rows }] = await Promise.all([
      db.from('tournament_overview').select('id, name, starts_at').eq('id', tournamentId).maybeSingle(),
      db.from('tournament_entrants').select('id, user_id, team_id, display_name, status, registered_at').eq('tournament_id', tournamentId),
    ])
    if (!t || !rows) return []
    const all = rows as Row[]
    const waitlist = all.filter((e) => e.status === 'waitlist').sort((a, b) => String(a.registered_at).localeCompare(String(b.registered_at)))
    const chosen = all.filter((e) => entrantIds.includes(e.id))

    // everyone to tell, per entrant
    const teamIds = chosen.map((e) => e.team_id).filter(Boolean) as string[]
    const { data: members } = teamIds.length
      ? await db.from('tournament_team_members').select('team_id, user_id').in('team_id', teamIds).eq('status', 'accepted')
      : { data: [] as Row[] }
    const membersOf = (teamId: string) => ((members ?? []) as Row[]).filter((m) => m.team_id === teamId).map((m) => m.user_id as string)
    const people = chosen.flatMap((e) => (e.user_id ? [{ entrant: e, userId: e.user_id as string }] : e.team_id ? membersOf(e.team_id).map((userId) => ({ entrant: e, userId })) : []))
    if (!people.length) return [] // walk-ins added by name have no number

    const userIds = Array.from(new Set(people.map((p) => p.userId)))
    const { data: profiles } = await db.from('user_profiles').select('user_id, username, full_name, phone').in('user_id', userIds)
    const profileOf = new Map(((profiles ?? []) as Row[]).map((p) => [p.user_id as string, p]))

    const jobs = people.map(({ entrant, userId }) => {
      const profile = profileOf.get(userId)
      const name = (profile?.full_name || profile?.username || entrant.display_name || 'Player') as string
      const position = waitlist.findIndex((w) => w.id === entrant.id) + 1
      const status = entrant.status === 'waitlist' ? `Waitlist number ${position || waitlist.length + 1}` : 'Registered'
      const base = { phone: profile?.phone as string | null, name, userId, urlParam: tournamentId, refs: { tournament_id: tournamentId, entrant_id: entrant.id as string } }
      return kind === 'moved_up'
        ? notify({ ...base, event: 'tournament_waitlist_moved_up', vars: { name, tournament: t.name }, dedupeKey: `tournament:${tournamentId}:${entrant.id}:${userId}:moved_up` }, withDb)
        : notify({ ...base, event: 'tournament_registered', vars: { name, tournament: t.name, status, starts: formatStart(t.starts_at) }, dedupeKey: `tournament:${tournamentId}:${entrant.id}:${userId}:registered` }, withDb)
    })
    return await Promise.all(jobs)
  } catch (e) {
    console.error('Tournament notification failed:', e instanceof Error ? e.message : e)
    return []
  }
}
