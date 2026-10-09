import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUsernameAvailable, resolveLoginEmail, signup, signupSchema, updateProfile } from '../services/auth'
import { availabilityQuery } from '../services/catalog'
import { rateLimit } from '../rateLimit'

const input = signupSchema.parse({
  email: 'A@B.com', password: 'secret1', full_name: 'Ann', username: 'ann_1', phone: '+91 98765 43210',
})

function fakeDb(o: {
  available?: boolean | null
  rpcError?: boolean
  createUser?: { user: { id: string } | null; error?: { message: string } | null }
  insertError?: { code?: string } | null
  profile?: { user_id: string } | null
  authEmail?: string | null
} = {}) {
  const deleteUser = vi.fn().mockResolvedValue({})
  const ilike = vi.fn()
  const db = {
    rpc: vi.fn().mockResolvedValue({ data: o.available ?? true, error: o.rpcError ? { message: 'x' } : null }),
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: o.createUser ? o.createUser.user : { id: 'u1' } },
          error: o.createUser?.error ?? null,
        }),
        deleteUser,
        getUserById: vi.fn().mockResolvedValue({ data: { user: o.authEmail === null ? null : { email: o.authEmail ?? 'ann@x.com' } } }),
      },
    },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: o.insertError ?? null }),
      select: () => ({ ilike: ilike.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: o.profile === undefined ? { user_id: 'u1' } : o.profile }) }) }),
      update: (fields: unknown) => ({ eq: vi.fn().mockResolvedValue({ error: null, fields }) }),
    })),
  }
  return { db: db as unknown as SupabaseClient, deleteUser, ilike, raw: db }
}

describe('signupSchema', () => {
  it('normalises email and rejects odd usernames / short passwords', () => {
    expect(input.email).toBe('a@b.com')
    expect(() => signupSchema.parse({ ...input, username: 'a b' })).toThrow()
    expect(() => signupSchema.parse({ ...input, username: 'ab' })).toThrow()
    expect(() => signupSchema.parse({ ...input, password: '123' })).toThrow()
    expect(() => signupSchema.parse({ ...input, phone: 'abc' })).toThrow()
  })
})

describe('signup', () => {
  it('creates the user and profile', async () => {
    const { db } = fakeDb()
    expect(await signup(input, db)).toEqual({ message: 'Account created successfully', user_id: 'u1' })
  })
  it('rejects a taken username before creating anything', async () => {
    const { db, raw } = fakeDb({ available: false })
    await expect(signup(input, db)).rejects.toMatchObject({ status: 400, message: 'Username is already taken' })
    expect(raw.auth.admin.createUser).not.toHaveBeenCalled()
  })
  it('reports duplicate emails clearly', async () => {
    const { db } = fakeDb({ createUser: { user: null, error: { message: 'User already registered' } } })
    await expect(signup(input, db)).rejects.toMatchObject({ status: 400, message: 'An account with this email already exists' })
  })
  it('removes the auth user when the profile insert fails (old code leaked it on exceptions)', async () => {
    const { db, deleteUser } = fakeDb({ insertError: { code: 'XX000' } })
    await expect(signup(input, db)).rejects.toMatchObject({ status: 500, message: 'Failed to create user profile' })
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })
  it('turns a username race (unique violation) into a 400 and cleans up', async () => {
    const { db, deleteUser } = fakeDb({ insertError: { code: '23505' } })
    await expect(signup(input, db)).rejects.toMatchObject({ status: 400, message: 'Username is already taken' })
    expect(deleteUser).toHaveBeenCalled()
  })
})

describe('resolveLoginEmail', () => {
  it('passes emails through without touching the database', async () => {
    const { db, raw } = fakeDb()
    expect(await resolveLoginEmail('a@b.com', db)).toEqual({ email: 'a@b.com' })
    expect(raw.from).not.toHaveBeenCalled()
  })
  it('looks usernames up case-insensitively with LIKE wildcards escaped', async () => {
    const { db, ilike } = fakeDb()
    expect(await resolveLoginEmail('ann_1', db)).toEqual({ email: 'ann@x.com' })
    expect(ilike).toHaveBeenCalledWith('username', 'ann\\_1')
  })
  it('404s for unknown usernames and users without an email', async () => {
    await expect(resolveLoginEmail('nobody', fakeDb({ profile: null }).db)).rejects.toMatchObject({ status: 404 })
    await expect(resolveLoginEmail('ann', fakeDb({ authEmail: null }).db)).rejects.toMatchObject({ status: 404 })
  })
})

describe('isUsernameAvailable / updateProfile', () => {
  it('reports the real answer, and a failed check is an error, never "taken"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await isUsernameAvailable('x', fakeDb({ available: true }).db)).toEqual({ available: true })
    expect(await isUsernameAvailable('x', fakeDb({ available: false }).db)).toEqual({ available: false })
    await expect(isUsernameAvailable('x', fakeDb({ rpcError: true }).db)).rejects.toMatchObject({ status: 503 })
  })
  it('requires at least one field', async () => {
    await expect(updateProfile('u1', {}, fakeDb().db)).rejects.toMatchObject({ status: 400, message: 'No valid fields to update' })
    expect(await updateProfile('u1', { full_name: 'New' }, fakeDb().db)).toEqual({ message: 'Profile updated successfully' })
  })
})

describe('availabilityQuery', () => {
  it('accepts valid input and rejects bad types/dates', () => {
    expect(availabilityQuery.parse({ type: 'PS5', date: '2030-01-01' })).toBeTruthy()
    expect(() => availabilityQuery.parse({ type: 'XBOX', date: '2030-01-01' })).toThrow()
    expect(() => availabilityQuery.parse({ type: 'PC', date: '2030-13-45' })).toThrow()
    expect(() => availabilityQuery.parse({ type: 'PC', date: '01/01/2030' })).toThrow()
  })
})

describe('rateLimit', () => {
  const req = (ip: string) => new Request('http://x', { headers: { 'x-forwarded-for': ip } })
  it('blocks after the limit, per IP, and recovers after the window', () => {
    const t = 1_000_000
    for (let i = 0; i < 3; i++) rateLimit(req('1.1.1.1'), 't1', 3, 60_000, t + i)
    expect(() => rateLimit(req('1.1.1.1'), 't1', 3, 60_000, t + 10)).toThrow(/Too many/)
    expect(() => rateLimit(req('2.2.2.2'), 't1', 3, 60_000, t + 10)).not.toThrow()
    expect(() => rateLimit(req('1.1.1.1'), 't1', 3, 60_000, t + 61_000)).not.toThrow()
  })
})
