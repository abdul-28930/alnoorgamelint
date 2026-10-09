import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_GROUPS, isActive } from './admin-navbar'

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
