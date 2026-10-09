/**
 * Booking status is derived from the clock on read, so listing bookings never has to write
 * (the old backend ran three global UPDATEs on every GET). The reminders cron persists it.
 * Reservations (no start_time) keep their stored status until they are checked in.
 */
export interface StatusFields {
  status: string | null
  start_at: string
  end_at: string
  start_time: string | null
  checked_in: boolean | null
  cancelled_at?: string | null
}

export function effectiveStatus(b: StatusFields, nowIst: string): string {
  const stored = b.status ?? 'UPCOMING'
  if (b.cancelled_at || stored === 'CANCELLED') return 'CANCELLED'
  if (!b.start_time && !b.checked_in) return stored // reservation: untouched until check-in
  if (stored === 'ENDED') return 'ENDED'
  if (b.end_at <= nowIst) {
    // A checked-in session stays ONGOING until staff stop it; anything else has ended.
    return b.checked_in ? 'ONGOING' : 'ENDED'
  }
  if (b.start_at <= nowIst) return 'ONGOING'
  return stored === 'ONGOING' ? 'ONGOING' : 'UPCOMING'
}
