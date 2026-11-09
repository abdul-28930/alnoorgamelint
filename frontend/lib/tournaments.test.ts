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

import { sortEntrants } from './tournaments'

describe('sortEntrants', () => {
  const rows = [
    { display_name: 'sameer', registered_at: '2026-11-02T10:00:00Z' },
    { display_name: 'Abdul', registered_at: '2026-11-03T10:00:00Z' },
    { display_name: 'Zaid', registered_at: '2026-11-01T10:00:00Z' },
    { display_name: 'abdul', registered_at: '2026-11-04T10:00:00Z' },
  ]
  it('A to Z ignores capital letters', () => {
    expect(sortEntrants(rows, 'az').map((r) => r.display_name)).toEqual(['Abdul', 'abdul', 'sameer', 'Zaid'])
  })
  it('newest first and oldest first follow the registration time', () => {
    expect(sortEntrants(rows, 'newest').map((r) => r.display_name)).toEqual(['abdul', 'Abdul', 'sameer', 'Zaid'])
    expect(sortEntrants(rows, 'oldest').map((r) => r.display_name)).toEqual(['Zaid', 'sameer', 'Abdul', 'abdul'])
  })
  it('does not change the list it was given', () => {
    const copy = rows.slice()
    sortEntrants(rows, 'az')
    expect(rows).toEqual(copy)
  })
})
