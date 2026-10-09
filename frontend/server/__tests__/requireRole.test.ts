import { describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'

const roles: Record<string, string | null> = {}
vi.mock('../env', () => ({ getEnv: () => ({ SUPABASE_URL: 'http://x', SUPABASE_JWT_SECRET: 'test-secret-test-secret-test-secret-123', CRON_SECRET: 'cron-secret' }) }))
vi.mock('../supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, id: unknown) => ({
          maybeSingle: () => Promise.resolve({ data: table === 'user_roles' ? (roles[id as string] ? { role: roles[id as string] } : null) : null, error: null }),
        }),
      }),
    }),
  }),
}))

import { requireCronSecret, requireRole } from '../auth'

const secret = new TextEncoder().encode('test-secret-test-secret-test-secret-123')
const req = async (sub: string) =>
  new Request('http://x', {
    headers: { authorization: `Bearer ${await new SignJWT({ email: `${sub}@x.com` }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setAudience('authenticated').setExpirationTime('1h').sign(secret)}` },
  })

describe('requireRole', () => {
  it('lets matching roles through and returns the user', async () => {
    roles.boss = 'admin'
    roles.clerk = 'staff'
    expect(await requireRole(await req('boss'), ['admin'])).toMatchObject({ id: 'boss', role: 'admin' })
    expect(await requireRole(await req('clerk'), ['staff', 'admin'])).toMatchObject({ role: 'staff' })
  })
  it('403s a signed-in user without the role (staff cannot reach admin-only routes)', async () => {
    roles.plain = null
    await expect(requireRole(await req('plain'), ['staff', 'admin'])).rejects.toMatchObject({ status: 403 })
    roles.clerk2 = 'staff'
    await expect(requireRole(await req('clerk2'), ['admin'])).rejects.toMatchObject({ status: 403 })
  })
})

describe('requireCronSecret', () => {
  it('accepts only the exact bearer secret', () => {
    expect(() => requireCronSecret(new Request('http://x', { headers: { authorization: 'Bearer cron-secret' } }))).not.toThrow()
    expect(() => requireCronSecret(new Request('http://x', { headers: { authorization: 'Bearer nope' } }))).toThrow()
    expect(() => requireCronSecret(new Request('http://x'))).toThrow()
  })
})
