import { beforeEach, describe, expect, it, vi } from 'vitest'

const state: { role?: { role: string } | null; settings?: { admin_emails: string } | null; error?: boolean; calls: number } = { calls: 0 }

vi.mock('../supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            state.calls++
            const data = table === 'user_roles' ? state.role : state.settings
            return Promise.resolve({ data: data ?? null, error: state.error ? { message: 'db down' } : null })
          },
        }),
      }),
    }),
  }),
}))

import { getRole } from '../auth'

let n = 0
const uid = () => `user-${++n}` // distinct ids avoid the module's role cache between tests

beforeEach(() => {
  state.role = null
  state.settings = null
  state.error = false
  state.calls = 0
})

describe('getRole', () => {
  it('uses the user_roles row first', async () => {
    state.role = { role: 'staff' }
    state.settings = { admin_emails: '["a@b.com"]' }
    expect(await getRole(uid(), 'a@b.com')).toBe('staff')
  })
  it('falls back to the admin email list', async () => {
    state.settings = { admin_emails: '["boss@x.com"]' }
    expect(await getRole(uid(), 'boss@x.com')).toBe('admin')
    expect(await getRole(uid(), 'other@x.com')).toBe('user')
  })
  it('treats malformed admin_emails as no admins', async () => {
    state.settings = { admin_emails: 'not json' }
    expect(await getRole(uid(), 'boss@x.com')).toBe('user')
  })
  it('caches successful lookups', async () => {
    const id = uid()
    await getRole(id, 'x@y.com')
    const before = state.calls
    await getRole(id, 'x@y.com')
    expect(state.calls).toBe(before)
  })
  it('503s on database errors and does not cache the failure', async () => {
    const id = uid()
    state.error = true
    await expect(getRole(id, 'x@y.com')).rejects.toMatchObject({ status: 503 })
    state.error = false
    state.role = { role: 'admin' }
    expect(await getRole(id, 'x@y.com')).toBe('admin')
  })
})
