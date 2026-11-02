import { describe, expect, it } from 'vitest'
import { toIstInput } from './tournaments'

describe('toIstInput', () => {
  it('shows a stored instant on the café clock for the date picker', () => {
    expect(toIstInput('2026-11-14T05:30:00+00:00')).toBe('2026-11-14T11:00')
    expect(toIstInput('2026-11-14T18:30:00Z')).toBe('2026-11-15T00:00')
  })
  it('is empty when there is no date', () => {
    expect(toIstInput(null)).toBe('')
    expect(toIstInput('nonsense')).toBe('')
  })
})
