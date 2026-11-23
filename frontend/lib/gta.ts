import { apiError, apiFetch } from './api'

export interface GtaPackage { id: string; players: 1 | 2; name: string; hours: number; price: number; includes: string | null; badge: string | null; active: boolean; sort_order: number }
export interface GtaSettings { open_time: string; close_time: string; slot_minutes: number; block_max_hours: number; max_visit_hours: number }
export interface GtaSlot { start: string; free: boolean; reason?: 'taken' | 'past' | 'closes' }
export interface GtaVisit {
  id: string; pass_id: string; start_at: string; end_at: string; duration_minutes: number
  status: 'UPCOMING' | 'ONGOING' | 'ENDED' | 'CANCELLED'
  checked_in_at?: string | null; timer_started_at?: string | null; timer_total_seconds: number; minutes_counted: number
  pass?: GtaPass | null
}
export interface GtaPass {
  id: string; package_name: string; players: number; hours: number; price: number; includes: string | null
  total_minutes: number; used_minutes: number; remaining_minutes: number; unbooked_minutes?: number
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  payment_status: 'PENDING' | 'PARTIAL' | 'PAID'; amount_paid: number; payment_method?: string | null
  food_served: boolean; created_at: string
  customer?: string; customer_phone?: string | null
  visits?: GtaVisit[]
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await apiFetch(path, json === undefined ? rest : { ...rest, method: rest.method ?? 'POST', body: JSON.stringify(json) })
  if (!res.ok) throw Object.assign(new Error(await apiError(res, 'Something went wrong')), { status: res.status })
  return (await res.json().catch(() => ({}))) as T
}

export const gta = {
  catalog: () => call<{ settings: GtaSettings; packages: GtaPackage[] }>('/api/v1/gta/packages'),
  availability: (date: string, durationMinutes: number) => call<{ slots: GtaSlot[]; settings: GtaSettings }>(`/api/v1/gta/availability?date=${date}&duration_minutes=${durationMinutes}`),
  buy: (packageId: string, startAt?: string) => call<{ pass_id: string }>('/api/v1/gta/purchase', { json: { package_id: packageId, ...(startAt ? { start_at: startAt } : {}) } }),
  my: () => call<GtaPass[]>('/api/v1/gta/my'),
  bookVisit: (passId: string, startAt: string, durationMinutes: number) => call(`/api/v1/gta/passes/${passId}/visits`, { json: { start_at: startAt, duration_minutes: durationMinutes } }),
  cancelVisit: (visitId: string) => call(`/api/v1/gta/visits/${visitId}/cancel`, { json: {} }),
}

const A = '/api/v1/admin/gta'
export const gtaAdmin = {
  schedule: (date: string) => call<{ date: string; settings: GtaSettings; visits: GtaVisit[] }>(`${A}/schedule?date=${date}`),
  passes: () => call<GtaPass[]>(`${A}/passes`),
  walkin: (body: Record<string, unknown>) => call<{ pass_id: string }>(`${A}/walkin`, { json: body }),
  bookVisit: (passId: string, startAt: string, durationMinutes: number) => call(`${A}/passes/${passId}/visits`, { json: { start_at: startAt, duration_minutes: durationMinutes } }),
  pay: (passId: string, amountPaid: number, method?: string) => call(`${A}/passes/${passId}/payment`, { json: { amount_paid: amountPaid, ...(method ? { payment_method: method } : {}) } }),
  addOn: (passId: string, packageId: string, startAt?: string) => call(`${A}/passes/${passId}/addon`, { json: { package_id: packageId, ...(startAt ? { start_at: startAt } : {}) } }),
  food: (passId: string, served: boolean) => call(`${A}/passes/${passId}/food`, { json: { food_served: served } }),
  visit: (visitId: string, action: 'start' | 'stop' | 'cancel') => call<Record<string, unknown>>(`${A}/visits/${visitId}/${action}`, { json: {} }),
  packages: () => call<GtaPackage[]>(`${A}/packages`),
  createPackage: (body: Record<string, unknown>) => call<GtaPackage>(`${A}/packages`, { json: body }),
  updatePackage: (id: string, body: Record<string, unknown>) => call<GtaPackage>(`${A}/packages/${id}`, { method: 'PUT', json: body }),
  deletePackage: (id: string) => call(`${A}/packages/${id}`, { method: 'DELETE' }),
  settings: () => call<GtaSettings>(`${A}/settings`),
  saveSettings: (body: Partial<GtaSettings>) => call<GtaSettings>(`${A}/settings`, { method: 'PUT', json: body }),
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Wed 25 Nov, 10:00 AM" for an IST text time "2026-11-25 10:00:00". */
export function istLabel(at: string): string {
  const d = new Date(`${at.slice(0, 10)}T00:00:00Z`)
  const h = Number(at.slice(11, 13))
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${(h % 12) || 12}:${at.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`
}
export function clock12(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2))
  return `${(h % 12) || 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`
}
export function hoursLabel(minutes: number): string {
  const m = Math.abs(Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  const t = h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`
  return minutes < 0 ? `${t} over` : t
}
export const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`
export function todayIst(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)
}
