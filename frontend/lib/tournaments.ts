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
  prize_details?: string | null
  banner_image?: string | null
  poster_image?: string | null
  rules?: string | null
  registered_count: number
  waitlist_count: number
  view_count: number
  champion_entrant_id?: string | null
  starts_at?: string | null
  ends_at?: string | null
  registration_closes_at?: string | null
  parent_id?: string | null
  day_no?: number | null
  split_days?: number | null
}

export interface RankedPlayer { place: number; entrant_id: string; display_name: string | null; reason: string }

export interface DayInfo { id: string; name: string; day_no: number | null; status: string; max_players: number; registered_count: number; waitlist_count: number; starts_at: string | null; ends_at: string | null; champion_name: string | null }
export interface DaysInfo { parent: { id: string; name: string } | null; days: DayInfo[] }

export interface Entrant {
  id: string
  display_name: string
  seed: number | null
  status: 'registered' | 'waitlist' | 'checked_in' | 'withdrawn' | 'disqualified'
  payment_status: 'NOT_REQUIRED' | 'PENDING' | 'PAID'
  no_show?: boolean
  registered_at?: string | null
  email?: string | null // staff screens only
  phone?: string | null
  user_id?: string | null
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
  scheduled_at?: string | null
  console_no?: number | null
}

export interface GoalsRow { entrant_id: string; display_name: string | null; rank: number; played: number; won: number; lost: number; goals_for: number; goals_against: number; diff: number }

export interface ScheduleSettings {
  consoles: number
  match_minutes: number
  buffer_minutes: number
  days: { date: string; start: string; end: string }[]
  breaks: { date?: string; start: string; end: string; label?: string }[]
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
  goals?: GoalsRow[]
  final_ranking?: RankedPlayer[]
  days?: DaysInfo | null
  champion_name: string | null
}

/** Calls the API and returns parsed JSON, or throws an Error carrying the server's message. */
export async function call<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await apiFetch(path, json === undefined ? rest : { ...rest, method: rest.method ?? 'POST', body: JSON.stringify(json) })
  if (!res.ok) throw Object.assign(new Error(await apiError(res, 'Something went wrong')), { status: res.status })
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
  addEntrant: (id: string, body: { display_name?: string; username?: string; user_id?: string; phone?: string; email?: string; send_whatsapp?: boolean; to_waitlist?: boolean }) => call(`${base}/tournaments/${id}/entrants`, { json: body }),
  updateEntrant: (id: string, entrantId: string, body: Record<string, unknown>) =>
    call(`${base}/tournaments/${id}/entrants/${entrantId}`, { method: 'PUT', json: body }),
  uploadImage: async (id: string, kind: ImageKind, file: Blob) => {
    const body = new FormData()
    body.append('file', file, 'image.jpg')
    return call<{ url: string }>(`${base}/tournaments/${id}/image?kind=${kind}`, { method: 'POST', body })
  },
  removeImage: (id: string, kind: ImageKind) => call(`${base}/tournaments/${id}/image?kind=${kind}`, { method: 'DELETE' }),
  /** Downloads the players as a PDF (staff only: it includes phone numbers and emails). */
  downloadEntrantsPdf: async (id: string, list: 'registered' | 'waitlist' | 'active' | 'all', order: 'registered' | 'name' = 'registered') => {
    const res = await apiFetch(`${base}/tournaments/${id}/entrants/pdf?list=${list}&order=${order}`)
    if (!res.ok) throw new Error(await apiError(res, 'Could not make the PDF'))
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `tournament_players_${list}${order === 'name' ? '_a-z' : ''}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  },
  /** The bracket (or, before it is generated, the preview in this order) as a PDF with phone numbers and the waitlist. */
  downloadBracketPdf: async (id: string, order?: string[]) => {
    const res = await apiFetch(`${base}/tournaments/${id}/bracket/pdf`, { method: 'POST', body: JSON.stringify(order ? { order } : {}) })
    if (!res.ok) throw new Error(await apiError(res, 'Could not make the PDF'))
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = 'tournament_bracket.pdf'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  },
  /** Puts a waitlisted entrant (entrantId) or a member who is not entered yet (userId) in the place of a no-show. */
  swapWaitlist: (id: string, outEntrantId: string, who: { entrantId?: string; userId?: string }) =>
    call(`${base}/tournaments/${id}/bracket/swap`, { json: { out_entrant_id: outEntrantId, ...(who.entrantId ? { in_entrant_id: who.entrantId } : { in_user_id: who.userId }) } }),
  splitPreview: (id: string, method: string, capacity?: number) =>
    call<{ capacity: number; days: { day: number; name: string; players: number; waitlist: number }[] }>(`${base}/tournaments/${id}/split`, { json: { method, preview: true, ...(capacity ? { capacity } : {}) } }),
  split: (id: string, method: string, capacity?: number) =>
    call<{ days: { day: number; id: string | null; name: string; players: number; waitlist: number }[] }>(`${base}/tournaments/${id}/split`, { json: { method, ...(capacity ? { capacity } : {}) } }),
  moveToDay: (id: string, entrantId: string, toTournamentId: string) =>
    call<{ status: string }>(`${base}/tournaments/${id}/entrants/${entrantId}/move`, { json: { to_tournament_id: toTournamentId } }),
  scheduleSettings: (id: string) => call<{ settings: ScheduleSettings | null }>(`${base}/tournaments/${id}/schedule`, { method: 'GET' }),
  planSchedule: (id: string, settings: ScheduleSettings, replanFromNow: boolean) =>
    call<{ scheduled: number; unscheduled: number; first: string | null; last: string | null }>(`${base}/tournaments/${id}/schedule`, { json: { settings, replan_from_now: replanFromNow } }),
  reshuffle: (id: string, replaceFromWaitlist = true) =>
    call<{ reshuffled: boolean; replaced: number; no_shows: number; present: number }>(`${base}/tournaments/${id}/bracket/reshuffle`, { json: { replace_from_waitlist: replaceFromWaitlist } }),
  notifyPreview: (id: string, audience: string, round?: number) =>
    call<NotifyPreview>(`${base}/tournaments/${id}/notify/preview?audience=${audience}${round ? `&round=${round}` : ''}`),
  notifyStart: (id: string, body: { audience: string; round?: number; message: string; batch_id: string }) =>
    call<NotifyProgress>(`${base}/tournaments/${id}/notify`, { json: body }),
  notifyContinue: (id: string, batch_id: string) => call<NotifyProgress>(`${base}/tournaments/${id}/notify/continue`, { json: { batch_id } }),
  callMatch: (matchId: string) => call<{ called: { name: string; status: string; detail?: string }[] }>(`${base}/tournament-matches/${matchId}/call`, { method: 'POST' }),
  removeEntrant: (id: string, entrantId: string) => call(`${base}/tournaments/${id}/entrants/${entrantId}`, { method: 'DELETE' }),
  preview: (id: string, order?: string[], schedule?: ScheduleSettings) =>
    call<{ order: { id: string; seed: number; display_name: string }[]; matches: Match[]; schedule?: { scheduled: number; unscheduled: number; first: string | null; last: string | null } | null }>(`${base}/tournaments/${id}/bracket/preview`, { json: { order, ...(schedule ? { schedule } : {}) } }),
  generate: (id: string, order?: string[], schedule?: ScheduleSettings) => call<TournamentDetail>(`${base}/tournaments/${id}/bracket`, { json: { order, ...(schedule ? { schedule } : {}) } }),
  result: (matchId: string, body: Record<string, unknown>) => call(`${base}/tournament-matches/${matchId}/result`, { method: 'PUT', json: body }),
  undo: (matchId: string) => call(`${base}/tournament-matches/${matchId}/result`, { method: 'DELETE' }),
  match: (matchId: string, body: Record<string, unknown>) => call(`${base}/tournament-matches/${matchId}`, { method: 'PUT', json: body }),
}

export interface NotifyPreview { entrants: number; people: number; with_number: number; without_number: number; sample: string[] }
export interface NotifyProgress {
  batch_id: string; people?: number; sent: number; failed: number; unconfirmed: number; remaining: number
  totals: { pending: number; sent: number; failed: number; unconfirmed: number; skipped: number }
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
  entrants: { id: string; display_name: string; seed: number | null; status: string; registered_at?: string | null; team_members: { name: string }[] }[]
  matches: Match[]
  rounds: number
  standings: StandingRow[]
  goals?: GoalsRow[]
  final_ranking?: RankedPlayer[]
  days?: DaysInfo | null
  champion_name: string | null
  waitlist: { position: number; id: string; display_name: string }[]
  my_waitlist_position: number | null
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

/** A stored instant (UTC ISO) as the café's clock, for <input type="datetime-local">: "2026-11-14T11:00". */
export function toIstInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 16)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A kick-off time on the café's clock: { day: 'Sat 14 Nov', time: '11:04 AM', key: '2026-11-14' } */
export function slotParts(iso: string | null | undefined): { day: string; time: string; key: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const ist = new Date(d.getTime() + 330 * 60 * 1000)
  const h = ist.getUTCHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return {
    day: `${DAYS[ist.getUTCDay()]} ${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`,
    time: `${h12}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`,
    key: ist.toISOString().slice(0, 10),
  }
}

export type EntrantSort = 'oldest' | 'newest' | 'az'

/** The list in the order staff or players asked for: oldest registration first (the queue order), newest first, or A to Z. */
export function sortEntrants<T extends { display_name: string; registered_at?: string | null }>(rows: T[], sort: EntrantSort): T[] {
  const time = (r: T) => String(r.registered_at ?? '')
  const copy = rows.slice()
  if (sort === 'az') return copy.sort((a, b) => a.display_name.localeCompare(b.display_name, 'en', { sensitivity: 'base' }) || time(a).localeCompare(time(b)))
  if (sort === 'newest') return copy.sort((a, b) => time(b).localeCompare(time(a)))
  return copy.sort((a, b) => time(a).localeCompare(time(b)))
}

/** "Sat 14 Nov, 11:00 AM to about 6:00 PM" (the end is dropped when it is not set). */
export function timeRange(startsAt: string | null | undefined, endsAt: string | null | undefined): string {
  const s = slotParts(startsAt)
  if (!s) return ''
  const e = slotParts(endsAt)
  if (!e) return `${s.day}, ${s.time}`
  return e.key === s.key ? `${s.day}, ${s.time} to about ${e.time}` : `${s.day}, ${s.time} to about ${e.day}, ${e.time}`
}
