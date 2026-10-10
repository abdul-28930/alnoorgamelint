import { apiFetch, apiError } from './api'

export type ImageKind = 'banner' | 'poster'
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
  banner_image?: string | null
  poster_image?: string | null
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
  uploadImage: async (id: string, kind: ImageKind, file: Blob) => {
    const body = new FormData()
    body.append('file', file, 'image.jpg')
    return call<{ url: string }>(`${base}/tournaments/${id}/image?kind=${kind}`, { method: 'POST', body })
  },
  removeImage: (id: string, kind: ImageKind) => call(`${base}/tournaments/${id}/image?kind=${kind}`, { method: 'DELETE' }),
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

// ---- public side ----------------------------------------------------------------------------------

export type PublicTournament = Omit<TournamentRow, 'id'> & {
  id: string
  banner_image?: string | null
  prize_details?: string | null
  rules?: string | null
}

export interface MyTeam {
  id: string
  name: string
  is_captain: boolean
  my_status: 'invited' | 'accepted'
  entrant: { id: string; status: string; payment_status: string } | null
  members: { name: string; status: string }[]
}

export interface PublicDetail {
  tournament: PublicTournament
  entrants: { id: string; display_name: string; seed: number | null; status: string; team_members: { name: string }[] }[]
  matches: Match[]
  rounds: number
  standings: StandingRow[]
  champion_name: string | null
  me: { entrant: { id: string; status: string; payment_status: string } | null; teams: MyTeam[] } | null
}

export interface Invitation { team_id: string; team_name: string; tournament_id: string; tournament_name: string; captain: string }

const pub = '/api/v1/tournaments'
export const publicApi = {
  list: () => call<PublicTournament[]>(pub),
  detail: (id: string) => call<PublicDetail>(`${pub}/${id}`),
  view: (id: string, visitor_id: string) => call<{ view_count: number }>(`${pub}/${id}/view`, { json: { visitor_id } }),
  register: (id: string) => call<{ message: string }>(`${pub}/${id}/register`, { method: 'POST' }),
  withdraw: (id: string) => call<{ message: string }>(`${pub}/${id}/register`, { method: 'DELETE' }),
  createTeam: (id: string, name: string, usernames: string[]) => call<{ message: string }>(`${pub}/${id}/teams`, { json: { name, usernames } }),
  invite: (id: string, teamId: string, username: string) => call<{ message: string }>(`${pub}/${id}/teams/${teamId}/invite`, { json: { username } }),
  accept: (id: string, teamId: string) => call<{ message: string }>(`${pub}/${id}/teams/${teamId}/accept`, { method: 'POST' }),
  leaveTeam: (id: string, teamId: string) => call<{ message: string }>(`${pub}/${id}/teams/${teamId}`, { method: 'DELETE' }),
  invitations: () => call<Invitation[]>(`${pub}/invitations`),
}

/** Random id kept in this browser, so a repeat visitor counts once a day. */
export function visitorId(): string {
  try {
    let v = localStorage.getItem('neo_visitor')
    if (!v) {
      v = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`.replace('.', '')).slice(0, 36)
      localStorage.setItem('neo_visitor', v)
    }
    return v
  } catch {
    return `anon${Math.random().toString(36).slice(2, 12)}`
  }
}

/**
 * Shrinks a picked image in the browser before upload (the server accepts about 4 MB), keeping its shape.
 * Banners are wide, posters are tall; either way the longest side is capped.
 */
export async function shrinkImage(file: File, maxSide: number): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That image could not be read'))
      el.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser cannot process images')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Your browser cannot process images')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const MAX_SIDE: Record<ImageKind, number> = { banner: 1800, poster: 1400 }
