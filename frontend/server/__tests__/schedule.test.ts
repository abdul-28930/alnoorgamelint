import { describe, expect, it } from 'vitest'
import { planSchedule, playingOrder, slotTimes, type PlanMatch, type ScheduleSettings } from '../tournaments/schedule'

const S: ScheduleSettings = {
  consoles: 4, match_minutes: 3, buffer_minutes: 1,
  days: [{ date: '2026-11-14', start: '11:00', end: '18:00' }, { date: '2026-11-15', start: '11:00', end: '18:00' }],
  breaks: [{ start: '13:30', end: '14:30', label: 'Lunch' }],
}
const round = (r: number, n: number, bracket = 'main'): PlanMatch[] => Array.from({ length: n }, (_, i) => ({ id: `r${r}${bracket}${i + 1}`, round: r, position: i + 1, bracket }))

describe('slotTimes', () => {
  it('starts a new slot every match + buffer minutes', () => {
    const t = slotTimes(S)
    expect(t.slice(0, 4)).toEqual(['2026-11-14 11:00', '2026-11-14 11:04', '2026-11-14 11:08', '2026-11-14 11:12'])
  })
  it('skips the lunch break and carries on after it', () => {
    const t = slotTimes(S).filter((x) => x.startsWith('2026-11-14'))
    expect(t.some((x) => x >= '2026-11-14 13:27' && x < '2026-11-14 14:30')).toBe(false) // a 3-minute match at 13:28 would run into the break
    expect(t).toContain('2026-11-14 14:30')
    expect(t).toContain('2026-11-14 13:24')
  })
  it('never starts a match that would end after closing time', () => {
    const t = slotTimes(S).filter((x) => x.startsWith('2026-11-15'))
    expect(t[t.length - 1]).toBe('2026-11-15 17:54') // the next slot, 17:58, would end at 18:01
  })
  it('a break on one day only applies to that day', () => {
    const t = slotTimes({ ...S, breaks: [{ date: '2026-11-15', start: '13:00', end: '14:00' }] })
    expect(t).toContain('2026-11-14 13:00')
    expect(t.filter((x) => x.startsWith('2026-11-15')).some((x) => x > '2026-11-15 12:57' && x < '2026-11-15 14:00')).toBe(false)
  })
  it('when re-planning, ignores earlier days and earlier times today', () => {
    const t = slotTimes(S, '2026-11-15 12:10')
    expect(t[0]).toBe('2026-11-15 12:10')
    expect(t.every((x) => x >= '2026-11-15 12:10')).toBe(true)
  })
})

describe('planSchedule', () => {
  it('runs 4 matches at once on consoles 1 to 4, then the next slot 4 minutes later', () => {
    const p = planSchedule(round(1, 8), S)
    expect(p.items.slice(0, 4).map((x) => [x.at, x.console])).toEqual([['2026-11-14 11:00', 1], ['2026-11-14 11:00', 2], ['2026-11-14 11:00', 3], ['2026-11-14 11:00', 4]])
    expect(p.items[4]).toMatchObject({ at: '2026-11-14 11:04', console: 1 })
    expect(p.unscheduled).toEqual([])
  })
  it('starts each round in a fresh slot, after the whole round before it', () => {
    const p = planSchedule([...round(1, 6), ...round(2, 3)], S) // 6 matches = 2 slots (4 + 2); round 2 starts in slot 3
    const at = new Map(p.items.map((x) => [x.id, x.at]))
    expect(at.get('r1main5')).toBe('2026-11-14 11:04')
    expect(at.get('r2main1')).toBe('2026-11-14 11:08')
  })
  it('puts the third-place match before the final', () => {
    const order = playingOrder([...round(3, 1), ...round(3, 1, 'third')]).map((m) => m.bracket)
    expect(order).toEqual(['third', 'main'])
    const p = planSchedule([...round(3, 1), ...round(3, 1, 'third')], S)
    expect(p.items.map((x) => x.console)).toEqual([1, 2]) // same slot on two consoles; the final is listed last
  })
  it('plans a whole 64-player bracket (63 matches) within day one', () => {
    const all = [...round(1, 32), ...round(2, 16), ...round(3, 8), ...round(4, 4), ...round(5, 2), ...round(6, 1)]
    const p = planSchedule(all, S)
    expect(p.items).toHaveLength(63)
    expect(p.unscheduled).toEqual([])
    expect(p.items.every((x) => x.at.startsWith('2026-11-14'))).toBe(true)
  })
  it('reports matches that do not fit in the days given', () => {
    const p = planSchedule(round(1, 400), { ...S, days: [{ date: '2026-11-14', start: '11:00', end: '12:00' }] })
    expect(p.items.length).toBeGreaterThan(0)
    expect(p.unscheduled.length).toBe(400 - p.items.length)
  })
  it('uses fewer consoles when asked to', () => {
    const p = planSchedule(round(1, 4), { ...S, consoles: 2 })
    expect(p.items.map((x) => [x.at.slice(11), x.console])).toEqual([['11:00', 1], ['11:00', 2], ['11:04', 1], ['11:04', 2]])
  })
})
