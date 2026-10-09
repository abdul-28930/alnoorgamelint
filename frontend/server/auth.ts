import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { getEnv } from './env'
import { getSupabase } from './supabase'
import { ApiError, forbidden, unauthorized } from './http'

export type Role = 'user' | 'staff' | 'admin'

export interface AuthUser {
  id: string
  email: string
  role: Role
}

export interface VerifiedToken {
  id: string
  email: string
}

type KeyInput = Uint8Array | JWTVerifyGetKey

/**
 * Verifies a Supabase access token: signature, expiry, audience.
 * (The old backend skipped signature verification entirely.)
 * `key` is injectable for tests; in production it is chosen from the token header.
 */
export async function verifyAccessToken(token: string, key?: KeyInput): Promise<VerifiedToken> {
  try {
    const resolved = key ?? resolveKey(token)
    const { payload } = await jwtVerify(token, resolved as never, {
      audience: 'authenticated',
      algorithms: ['HS256', 'ES256', 'RS256'],
    })
    if (!payload.sub) throw new Error('missing sub')
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' }
  } catch {
    throw unauthorized()
  }
}

let jwks: JWTVerifyGetKey | undefined

function resolveKey(token: string): KeyInput {
  const env = getEnv()
  const { alg } = decodeProtectedHeader(token)
  if (alg === 'HS256') {
    if (!env.SUPABASE_JWT_SECRET) throw new Error('SUPABASE_JWT_SECRET not configured')
    return new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  }
  jwks ??= createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  return jwks
}

const ROLE_TTL_MS = 60_000
const roleCache = new Map<string, { role: Role; expires: number }>()

/** The user_roles row gives the role; an email in admin_settings.admin_emails makes an admin regardless. Cached 60 s. */
export async function getRole(userId: string, email: string): Promise<Role> {
  const hit = roleCache.get(userId)
  if (hit && hit.expires > Date.now()) return hit.role

  const db = getSupabase()
  const [roleRes, settingsRes] = await Promise.all([
    db.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    db.from('admin_settings').select('admin_emails').eq('id', 1).maybeSingle(),
  ])

  // A failed lookup must not be cached (or silently demote an admin for a minute).
  if (roleRes.error || settingsRes.error) throw new ApiError(503, 'Service temporarily unavailable')

  let role: Role = (roleRes.data?.role as Role | undefined) ?? 'user'
  // Listing an email in admin_settings always makes an admin, even if a default 'user' row exists in user_roles
  // (the admin screens' own check already works this way, so the two must agree).
  if (role !== 'admin' && email && settingsRes.data?.admin_emails) {
    try {
      const emails: unknown = JSON.parse(settingsRes.data.admin_emails)
      if (Array.isArray(emails) && emails.some((e) => typeof e === 'string' && e.toLowerCase() === email.toLowerCase())) role = 'admin'
    } catch {
      /* malformed admin_emails: treat as no admins */
    }
  }
  roleCache.set(userId, { role, expires: Date.now() + ROLE_TTL_MS })
  return role
}

/** Call after changing admin emails so the change applies immediately on this instance. */
export function clearRoleCache(): void {
  roleCache.clear()
}

export function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized('Not authenticated')
  return token
}

export async function authenticate(req: Request): Promise<AuthUser> {
  const { id, email } = await verifyAccessToken(bearerToken(req))
  return { id, email, role: await getRole(id, email) }
}

/** Signed-in user if a valid token is sent, otherwise null. For public pages that show extra for players. */
export async function tryAuthenticate(req: Request): Promise<AuthUser | null> {
  if (!req.headers.get('authorization')) return null
  try {
    return await authenticate(req)
  } catch {
    return null
  }
}

export async function requireRole(req: Request, roles: Role[]): Promise<AuthUser> {
  const user = await authenticate(req)
  if (!roles.includes(user.role)) throw forbidden()
  return user
}

/** For the reminders endpoint: protected by a shared secret instead of a user token. */
export function requireCronSecret(req: Request): void {
  const secret = getEnv().CRON_SECRET
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret ?? ''}`)
  // constant-time compare; a missing secret never matches
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthorized('Invalid cron secret')
}
