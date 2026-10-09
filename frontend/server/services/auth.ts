import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ApiError, badRequest, notFound } from '../http'
import { getSupabase } from '../supabase'

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72),
  full_name: z.string().trim().min(1, 'Full name is required').max(100),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[A-Za-z0-9_.]+$/, 'Username may only contain letters, numbers, dots and underscores'),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Invalid phone number'),
})
export type SignupInput = z.infer<typeof signupSchema>

export const loginLookupSchema = z.object({
  email_or_username: z.string().trim().min(1),
  password: z.string().optional(), // accepted for compatibility; Supabase checks it client-side
})

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(100).optional(),
  profile_pic_url: z.string().url().max(500).nullable().optional(),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Invalid phone number').optional(),
})

/** Creates the auth user and profile; removes the auth user again if anything after it fails. */
export async function signup(input: SignupInput, db: SupabaseClient = getSupabase()) {
  const { data: available, error: rpcError } = await db.rpc('is_username_available', { check_username: input.username })
  if (rpcError) throw new ApiError(500, 'Signup failed')
  if (!available) throw badRequest('Username is already taken')

  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  })
  if (error || !data.user) {
    if (error && /already (been )?registered|already exists/i.test(error.message)) {
      throw badRequest('An account with this email already exists')
    }
    throw badRequest('Failed to create user')
  }
  const userId = data.user.id

  try {
    const { error: profileError } = await db
      .from('user_profiles')
      .insert({ user_id: userId, username: input.username, full_name: input.full_name, phone: input.phone })
    if (profileError) throw profileError
  } catch (err) {
    await db.auth.admin.deleteUser(userId).catch(() => undefined)
    // unique violation on username = lost a race with another signup
    if ((err as { code?: string })?.code === '23505') throw badRequest('Username is already taken')
    throw new ApiError(500, 'Failed to create user profile')
  }
  return { message: 'Account created successfully', user_id: userId }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Email as-is, or the email behind a username (case-insensitive). Every failure is the same 404. */
export async function resolveLoginEmail(emailOrUsername: string, db: SupabaseClient = getSupabase()) {
  if (emailOrUsername.includes('@')) return { email: emailOrUsername }

  const { data: profile } = await db
    .from('user_profiles')
    .select('user_id')
    .ilike('username', escapeLike(emailOrUsername))
    .maybeSingle()
  if (!profile) throw notFound('Username not found')

  const { data } = await db.auth.admin.getUserById(profile.user_id)
  if (!data?.user?.email) throw notFound('Username not found')
  return { email: data.user.email }
}

export async function isUsernameAvailable(username: string, db: SupabaseClient = getSupabase()) {
  const { data, error } = await db.rpc('is_username_available', { check_username: username })
  if (error) {
    // Do not report "taken" when the check itself failed (missing function, wrong keys, database down).
    console.error('is_username_available failed:', error)
    throw new ApiError(503, 'Could not check the username right now. Please try again.')
  }
  return { available: Boolean(data) }
}

export async function updateProfile(userId: string, input: z.infer<typeof profileUpdateSchema>, db: SupabaseClient = getSupabase()) {
  const fields = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
  if (Object.keys(fields).length === 0) throw badRequest('No valid fields to update')
  const { error } = await db.from('user_profiles').update(fields).eq('user_id', userId)
  if (error) throw new ApiError(500, 'Failed to update profile')
  return { message: 'Profile updated successfully' }
}
