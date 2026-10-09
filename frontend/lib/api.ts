/**
 * The one way the browser talks to our own API (`/api/v1/...`, served by this same Next.js app).
 * It attaches the signed-in user's Supabase access token, so call sites never handle tokens themselves.
 * (Before, several admin calls sent no token or read a `localStorage` key Supabase never writes.)
 */

// Same origin by default. Set NEXT_PUBLIC_BACKEND_URL only if the API is ever hosted elsewhere again.
export const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '')

async function accessToken(): Promise<string | null> {
  try {
    // dynamic import: lib/supabase.ts itself uses apiFetch, so a static import would be circular
    const { supabase } = await import('./supabase')
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/** fetch() for our API. Pass a path like `/api/v1/bookings`. Leaves JSON bodies, status and parsing to the caller. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = await accessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`) // the live session wins over any stale header
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

/** Error message from an API error body (`{ detail }`), with a fallback. */
export async function apiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json()
    return typeof body?.detail === 'string' ? body.detail : fallback
  } catch {
    return fallback
  }
}
