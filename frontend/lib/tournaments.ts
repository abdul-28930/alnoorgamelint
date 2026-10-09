import { apiFetch, apiError } from './api'

export type TournamentStatus = 'draft' | 'open' | 'paused' | 'active' | 'completed'

export interface TournamentRow {
  id: string
  name: string
  game: string
  platform: string
  status: TournamentStatus
  tournament_type: 'knockout' | 'league'
  max_players: number
  team_size: number
  best_of: number
  third_place_match: boolean
  double_round_robin: boolean
  seeding: 'random' | 'manual'
  entry_fee: number
  prize_pool: number
  description?: string
  registered_count: number
  waitlist_count: number
  view_count: number
  champion_entrant_id?: string | null
  starts_at?: string | null
  registration_closes_at?: string | null
}

export interface Entrant {
  id: string
  display_name: string
  seed: number | null
  status: 'registered' | 'waitlist' | 'checked_in' | 'withdrawn' | 'disqualified'
  payment_status: 'NOT_REQUIRED' | 'PENDING' | 'PAID'
  team_id?: string | null
  team_members: { user_id: string; name: string; status: string }[]
}

export interface Match {
  id: string
  round: number
  position: number
  bracket: string
  round_name: string
  status: 'pending' | 'ready' | 'live' | 'completed' | 'bye'
  entrant1_id: string | null
  entrant2_id: string | null
  entrant1_name: string | null
  entrant2_name: string | null
  score1: number | null
  score2: number | null
  winner_id: string | null
  winner_name: string | null
  walkover?: boolean
  best_of?: number
}

export interface StandingRow {
  entrant_id: string
  display_name?: string | null
  played: number
  won: number
  drawn: number
  lost: number
  points: number
  score_for: number
  score_against: number
}

export interface TournamentDetail {
  tournament: TournamentRow
  entrants: Entrant[]
  matches: Match[]
  rounds: number
  standings: StandingRow[]
  champion_name: string | null
}

/** Calls the API and returns parsed JSON, or throws an Error carrying the server's message. */
export async function call<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await apiFetch(path, json === undefined ? rest : { ...rest, method: rest.method ?? 'POST', body: JSON.stringify(json) })
  if (!res.ok) throw new Error(await apiError(res, 'Something went wrong'))
  return (await res.json().catch(() => ({}))) as T
}

const base = '/api/v1/admin'
export const api = {
  list: () => call<TournamentRow[]>(`${base}/tournaments`),
  detail: (id: string) => call<TournamentDetail>(`${base}/tournaments/${id}`),
  create: (body: Record<string, unknown>) => call<{ id: string }>(`${base}/tournaments`, { json: body }),
  update: (id: string, body: Record<string, unknown>) => call(`${base}/tournaments/${id}`, { method: 'PUT', json: body }),
  remove: (id: string) => call(`${base}/tournaments/${id}`, { method: 'DELETE' }),
  setStatus: (id: string, status: TournamentStatus) => call(`${base}/tournaments/${id}/status?status=${status}`, { method: 'PUT' }),
  addEntrant: (id: string, body: { display_name?: string; username?: string }) => call(`${base}/tournaments/${id}/entrants`, { json: body }),
  updateEntrant: (id: string, entrantId: string, body: Record<string, unknown>) =>
    call(`${base}/tournaments/${id}/entrants/${entrantId}`, { method: 'PUT', json: body }),
  removeEntrant: (id: string, entrantId: string) => call(`${base}/tournaments/${id}/entrants/${entrantId}`, { method: 'DELETE' }),
  preview: (id: string, order?: string[]) => call<{ order: { id: string; seed: number; display_name: string }[]; matches: Match[] }>(`${base}/tournaments/${id}/bracket/preview`, { json: { order } }),
  generate: (id: string, order?: string[]) => call<TournamentDetail>(`${base}/tournaments/${id}/bracket`, { json: { order } }),
  result: (matchId: string, body: Record<string, unknown>) => call(`${base}/tournament-matches/${matchId}/result`, { method: 'PUT', json: body }),
  undo: (matchId: string) => call(`${base}/tournament-matches/${matchId}/result`, { method: 'DELETE' }),
  match: (matchId: string, body: Record<string, unknown>) => call(`${base}/tournament-matches/${matchId}`, { method: 'PUT', json: body }),
}

export const STATUS_STYLE: Record<TournamentStatus, string> = {
  draft: 'bg-gray-700 text-gray-200',
  open: 'bg-green-900/60 text-green-300',
  paused: 'bg-yellow-900/60 text-yellow-300',
  active: 'bg-cyan-900/60 text-cyan-300',
  completed: 'bg-purple-900/60 text-purple-300',
}
