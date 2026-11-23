import { describe, expect, it } from 'vitest'
import { availability, minutesLabel, slotStarts, type GtaSettings } from '../gta/slots'

const S: GtaSettings = { open_time: '09:00', close_time: '23:30', slot_minutes: 60, block_max_hours: 5, max_visit_hours: 8 }
const D = '2026-11-25'

describe('slotStarts', () => {
  it('runs hourly from opening while a whole slot still fits before closing', () => {
    const s = slotStarts(S)
    expect(s[0]).toBe('09:00')
    expect(s[s.length - 1]).toBe('22:00') // 22:00-23:00 fits; 23:00-24:00 does not
    expect(s).toHaveLength(14)
  })
  it('follows the slot length', () => {
    expect(slotStarts({ ...S, slot_minutes: 30 }).slice(0, 3)).toEqual(['09:00', '09:30', '10:00'])
  })
})

describe('availability', () => {
  const NOW = '2026-11-24 12:00:00'
  it('marks everything free on an empty future day', () => {
    expect(availability(D, 60, S, [], NOW).every((x) => x.free)).toBe(true)
  })
  it('a visit needs its whole span: a 3 hour visit cannot start after 20:30', () => {
    const a = availability(D, 180, S, [], NOW)
    expect(a.find((x) => x.start === '20:00')).toEqual({ start: '20:00', free: true })
    expect(a.find((x) => x.start === '21:00')).toEqual({ start: '21:00', free: false, reason: 'closes' })
  })
  it('a booked visit blocks every start whose span would overlap it', () => {
    const busy = [{ start_at: `${D} 12:00:00`, end_at: `${D} 14:00:00` }]
    const a = availability(D, 120, S, busy, NOW)
    const free = (t: string) => a.find((x) => x.start === t)!.free
    expect(free('10:00')).toBe(true) // 10-12 ends exactly when the booking starts
    expect(free('11:00')).toBe(false) // 11-13 overlaps
    expect(free('13:00')).toBe(false)
    expect(free('14:00')).toBe(true)
    expect(a.find((x) => x.start === '12:00')!.reason).toBe('taken')
  })
  it('hours already gone today are not free', () => {
    const a = availability(D, 60, S, [], `${D} 15:20:00`)
    expect(a.find((x) => x.start === '15:00')).toEqual({ start: '15:00', free: false, reason: 'past' })
    expect(a.find((x) => x.start === '16:00')!.free).toBe(true)
  })
})

describe('minutesLabel', () => {
  it('writes hours and minutes', () => {
    expect(minutesLabel(155)).toBe('2 h 35 min')
    expect(minutesLabel(120)).toBe('2 h')
    expect(minutesLabel(45)).toBe('45 min')
    expect(minutesLabel(-30)).toBe('30 min over')
  })
})
