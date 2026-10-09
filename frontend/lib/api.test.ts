import { afterEach, describe, expect, it, vi } from 'vitest'

let session: { access_token: string } | null = { access_token: 'tok123' }
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session } }) } } }))

import { apiError, apiFetch } from './api'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url: url as string, headers: init.headers as Headers, init }
}

afterEach(() => {
  fetchMock.mockReset()
  session = { access_token: 'tok123' }
})

describe('apiFetch', () => {
  it('calls the same origin and attaches the signed-in token', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))
    await apiFetch('/api/v1/bookings')
    const { url, headers } = lastCall()
    expect(url).toBe('/api/v1/bookings')
    expect(headers.get('Authorization')).toBe('Bearer tok123')
  })
  it('uses the live session even if the caller passed a stale or bogus header', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))
    await apiFetch('/api/v1/admin/users', { headers: { Authorization: 'Bearer null' } })
    expect(lastCall().headers.get('Authorization')).toBe('Bearer tok123')
  })
  it('sets JSON content type only for string bodies', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))
    await apiFetch('/api/v1/bookings', { method: 'POST', body: '{"a":1}' })
    expect(lastCall().headers.get('Content-Type')).toBe('application/json')
    await apiFetch('/api/v1/bookings')
    expect(lastCall().headers.has('Content-Type')).toBe(false)
    await apiFetch('/api/v1/x', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } })
    expect(lastCall().headers.get('Content-Type')).toBe('text/plain')
  })
  it('sends no Authorization when signed out (public routes still work)', async () => {
    session = null
    fetchMock.mockResolvedValue(new Response('{}'))
    await apiFetch('/api/v1/stations')
    expect(lastCall().headers.has('Authorization')).toBe(false)
  })
  it('passes method and other options through', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))
    await apiFetch('/api/v1/bookings/1', { method: 'DELETE' })
    expect(lastCall().init.method).toBe('DELETE')
  })
})

describe('apiError', () => {
  it('reads { detail } or falls back', async () => {
    expect(await apiError(new Response(JSON.stringify({ detail: 'Slot taken' })), 'x')).toBe('Slot taken')
    expect(await apiError(new Response('not json'), 'fallback')).toBe('fallback')
    expect(await apiError(new Response(JSON.stringify({ detail: [{ msg: 'x' }] })), 'fallback')).toBe('fallback')
  })
})
