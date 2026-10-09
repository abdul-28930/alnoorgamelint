import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from './fakeDb'

let current = fakeDb()
vi.mock('../supabase', () => ({ getSupabase: () => current.db }))

import { clearRoleCache, getRole } from '../auth'

const world = (role: string | null, emails: string[] | string) => {
  current = fakeDb({ tables: { user_roles: { data: role ? { role } : null }, admin_settings: { data: { admin_emails: typeof emails === 'string' ? emails : JSON.stringify(emails) } } } })
}

describe('getRole', () => {
  beforeEach(() => clearRoleCache())
  it('an admin email wins over a default "user" row, ignoring case', async () => {
    world('user', ['Boss@Example.com'])
    expect(await getRole('u1', 'boss@example.com')).toBe('admin')
  })
  it('the user_roles row still grants staff, and unlisted users stay users', async () => {
    world('staff', ['boss@example.com'])
    expect(await getRole('u2', 'staff@example.com')).toBe('staff')
    world(null, ['boss@example.com'])
    expect(await getRole('u3', 'other@example.com')).toBe('user')
  })
  it('a malformed admin list means no admins', async () => {
    world(null, 'not json')
    expect(await getRole('u4', 'boss@example.com')).toBe('user')
  })
})
