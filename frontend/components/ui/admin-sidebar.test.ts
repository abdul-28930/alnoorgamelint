import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_NAV_GROUPS, isActive, readStoredState } from './admin-sidebar'

describe('admin nav', () => {
  it('marks only the current page active', () => {
    expect(isActive('/admin/bookings', '/admin/bookings')).toBe(true)
    expect(isActive('/admin/bookings', '/admin/dashboard')).toBe(false)
    expect(isActive('/admin/bookings/123', '/admin/bookings')).toBe(true) // nested pages keep their section highlighted
    expect(isActive('/admin/bookings-old', '/admin/bookings')).toBe(false)
    expect(isActive(null, '/admin/bookings')).toBe(false)
  })
  it('never highlights a section link that points into another page', () => {
    expect(isActive('/admin/settings', '/admin/settings#prepaid-plans')).toBe(false)
    expect(isActive('/admin/settings', '/admin/settings')).toBe(true)
  })
  it('links every admin page exactly once', () => {
    const hrefs = ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const page of ['dashboard', 'bookings', 'stations', 'receipts', 'users', 'coupons', 'points', 'tournaments', 'analytics', 'reports', 'settings']) {
      expect(hrefs.some((h) => h.startsWith(`/admin/${page}`))).toBe(true)
    }
  })
})

describe('remembered sidebar state', () => {
  afterEach(() => vi.unstubAllGlobals())
  const withStorage = (getItem: (k: string) => string | null) => vi.stubGlobal('window', { localStorage: { getItem } })

  it('restores open / closed and ignores anything else', () => {
    withStorage(() => 'open')
    expect(readStoredState()).toBe('open')
    withStorage(() => 'closed')
    expect(readStoredState()).toBe('closed')
    withStorage(() => 'banana')
    expect(readStoredState()).toBeNull()
    withStorage(() => null)
    expect(readStoredState()).toBeNull()
  })
  it('does not break when storage is blocked', () => {
    withStorage(() => {
      throw new Error('SecurityError')
    })
    expect(readStoredState()).toBeNull()
  })
})
