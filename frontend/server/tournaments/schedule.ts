/**
 * Match timetable. Pure: no database and no clock, so the rules are unit-tested.
 *
 * Staff set how many consoles there are, how long a match is, the gap between matches, each day's opening and closing
 * time, and any breaks (lunch, prayer). Matches are placed round by round: a round must be fully played before the next
 * one starts, so a winner never has to play before their last match ended. All times are IST wall-clock text.
 */
export interface ScheduleDay { date: string; start: string; end: string }
export interface ScheduleBreak { date?: string; start: string; end: string; label?: string }
export interface ScheduleSettings {
  consoles: number
  match_minutes: number
  buffer_minutes: number
  days: ScheduleDay[]
  breaks: ScheduleBreak[]
}
export interface PlanMatch { id: string; round: number; position: number; bracket: string }
export interface ScheduledMatch { id: string; at: string; console: number }
export interface Plan { items: ScheduledMatch[]; unscheduled: string[] }

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** The starting times of every slot (a slot = everything that kicks off together, one match per console). */
export function slotTimes(settings: ScheduleSettings, from?: string): string[] {
  const slotLen = settings.match_minutes + settings.buffer_minutes
  const slots: string[] = []
  for (const day of [...settings.days].sort((a, b) => a.date.localeCompare(b.date))) {
    const end = toMinutes(day.end)
    let t = toMinutes(day.start)
    if (from) {
      if (from.slice(0, 10) > day.date) continue // that day is already over
      if (from.slice(0, 10) === day.date) t = Math.max(t, toMinutes(from.slice(11, 16)))
    }
    const breaks = settings.breaks
      .filter((b) => !b.date || b.date === day.date)
      .map((b) => ({ s: toMinutes(b.start), e: toMinutes(b.end) }))
      .filter((b) => b.e > b.s)
    while (t + settings.match_minutes <= end) {
      const hit = breaks.find((b) => t < b.e && t + settings.match_minutes > b.s)
      if (hit) { t = hit.e; continue } // wait out the break, then carry on
      slots.push(`${day.date} ${toHHMM(t)}`)
      t += slotLen
    }
  }
  return slots
}

/** Round order, with the third-place match before the final so the final is always last. */
export function playingOrder(matches: PlanMatch[]): PlanMatch[] {
  return [...matches].sort((a, b) => a.round - b.round || (a.bracket === b.bracket ? 0 : a.bracket === 'third' ? -1 : 1) || a.position - b.position)
}

export function planSchedule(matches: PlanMatch[], settings: ScheduleSettings, from?: string): Plan {
  const slots = slotTimes(settings, from)
  const items: ScheduledMatch[] = []
  const unscheduled: string[] = []
  let slot = 0
  const ordered = playingOrder(matches)
  let i = 0
  while (i < ordered.length) {
    const round = ordered[i].round
    const group: PlanMatch[] = []
    while (i < ordered.length && ordered[i].round === round) group.push(ordered[i++])
    // a round starts in a fresh slot, so it never overlaps the one before it
    for (let k = 0; k < group.length; k++) {
      const s = slot + Math.floor(k / settings.consoles)
      if (s >= slots.length) unscheduled.push(group[k].id)
      else items.push({ id: group[k].id, at: slots[s], console: (k % settings.consoles) + 1 })
    }
    slot += Math.ceil(group.length / settings.consoles)
  }
  return { items, unscheduled }
}
