/**
 * Single time convention for the whole backend: stored booking times are IST
 * wall-clock text, "YYYY-MM-DD HH:MM:SS" (start_time/end_time "HH:MM").
 * India has no DST, so a fixed +05:30 offset is exact.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** "YYYY-MM-DD HH:MM:SS" in IST for the given instant. */
export function toIstString(date: Date = new Date()): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

/** "YYYY-MM-DD" in IST. */
export function istDate(date: Date = new Date()): string {
  return toIstString(date).slice(0, 10)
}

/** "HH:MM" in IST. */
export function istHHMM(date: Date = new Date()): string {
  return toIstString(date).slice(11, 16)
}

/** Parse an IST wall-clock string ("YYYY-MM-DD HH:MM:SS" or ISO without offset) into an instant. */
export function fromIstString(s: string): Date {
  const iso = s.trim().replace(' ', 'T')
  const d = new Date(`${iso.length === 16 ? iso + ':00' : iso}+05:30`)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid IST datetime: ${s}`)
  return d
}

export function addHoursIst(s: string, hours: number): string {
  return toIstString(new Date(fromIstString(s).getTime() + hours * 3_600_000))
}

/** Add days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  return toIstString(new Date(fromIstString(`${date} 00:00:00`).getTime() + days * 86_400_000)).slice(0, 10)
}

/**
 * Half-open interval overlap on same-format IST strings (lexicographic order
 * equals chronological order). Fixes the old check that missed bookings which
 * started before, or fully contained, the requested window.
 */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart
}
