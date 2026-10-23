const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The short code customers quote at the counter, e.g. NGC1A2B3C (the first 6 characters of the booking id). */
export function bookingReference(id: string): string {
  return `NGC${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

/** "2026-10-31" -> "31 Oct 2026" (the day is already an IST calendar date, so no time zone maths) */
export function formatDay(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd ?? ''))
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(ymd ?? '')
}

/** "16:00" / "16:00:00" -> "4:00 PM" */
export function formatClock(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''))
  if (!m) return String(hhmm ?? '')
  const h = Number(m[1])
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/** 150 -> "150", 150.5 -> "150.50" */
export function formatAmount(n: unknown): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}
