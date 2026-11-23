/**
 * GTA VI slot grid. Pure: no database and no clock, so the rules are unit-tested.
 * One dedicated console. A day is cut into slots from opening time; a visit of N minutes needs its whole span free and inside opening hours.
 * All times are IST wall-clock text ("YYYY-MM-DD HH:MM:SS"); `start` below is "HH:MM".
 */
export interface GtaSettings { open_time: string; close_time: string; slot_minutes: number; block_max_hours: number; max_visit_hours: number }
export interface BusyVisit { start_at: string; end_at: string }
export interface SlotState { start: string; free: boolean; reason?: 'taken' | 'past' | 'closes' }

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Every slot start of a day, from opening time, as long as one slot still fits before closing. */
export function slotStarts(s: GtaSettings): string[] {
  const out: string[] = []
  for (let t = toMin(s.open_time); t + s.slot_minutes <= toMin(s.close_time); t += s.slot_minutes) out.push(toHHMM(t))
  return out
}

/** For a visit of `durationMinutes`: which start times are free on `date`. A start in the past is not free. */
export function availability(date: string, durationMinutes: number, s: GtaSettings, busy: BusyVisit[], nowIst: string): SlotState[] {
  const close = toMin(s.close_time)
  return slotStarts(s).map((start) => {
    const startAt = `${date} ${start}:00`
    const endMin = toMin(start) + durationMinutes
    if (endMin > close) return { start, free: false, reason: 'closes' as const }
    if (startAt < nowIst) return { start, free: false, reason: 'past' as const }
    const endAt = `${date} ${toHHMM(endMin)}:00`
    if (busy.some((b) => b.start_at < endAt && b.end_at > startAt)) return { start, free: false, reason: 'taken' as const }
    return { start, free: true }
  })
}

/** "2 h 35 min" for a number of minutes (negative = over). */
export function minutesLabel(minutes: number): string {
  const m = Math.abs(Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  const text = h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`
  return minutes < 0 ? `${text} over` : text
}
