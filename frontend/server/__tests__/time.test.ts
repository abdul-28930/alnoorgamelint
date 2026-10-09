import { describe, expect, it } from 'vitest'
import { addDays, addHoursIst, fromIstString, istDate, istHHMM, overlaps, toIstString } from '../time'

describe('IST helpers', () => {
  it('formats UTC instants as IST wall clock', () => {
    const d = new Date('2026-03-01T20:00:00Z') // 01:30 next day in IST
    expect(toIstString(d)).toBe('2026-03-02 01:30:00')
    expect(istDate(d)).toBe('2026-03-02')
    expect(istHHMM(d)).toBe('01:30')
  })
  it('round-trips', () => {
    expect(toIstString(fromIstString('2026-03-02 01:30:00'))).toBe('2026-03-02 01:30:00')
  })
  it('adds hours across midnight and days across months', () => {
    expect(addHoursIst('2026-03-01 23:00:00', 2)).toBe('2026-03-02 01:00:00')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })
  it('rejects garbage', () => {
    expect(() => fromIstString('nope')).toThrow()
  })
})

describe('overlaps', () => {
  const s = '2026-03-01 10:00:00'
  const e = '2026-03-01 12:00:00'
  it('detects partial, containing and contained overlaps (old check missed two of these)', () => {
    expect(overlaps('2026-03-01 09:00:00', '2026-03-01 10:30:00', s, e)).toBe(true) // starts before
    expect(overlaps('2026-03-01 09:00:00', '2026-03-01 13:00:00', s, e)).toBe(true) // contains
    expect(overlaps('2026-03-01 10:30:00', '2026-03-01 11:00:00', s, e)).toBe(true) // inside
  })
  it('treats back-to-back bookings as free', () => {
    expect(overlaps('2026-03-01 12:00:00', '2026-03-01 13:00:00', s, e)).toBe(false)
    expect(overlaps('2026-03-01 08:00:00', '2026-03-01 10:00:00', s, e)).toBe(false)
  })
})
