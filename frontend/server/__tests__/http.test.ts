import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, parseJson, route } from '../http'

describe('route()', () => {
  it('serialises plain return values', async () => {
    const res = await route(async () => ({ ok: true }))(new Request('http://x'), undefined)
    expect(await res.json()).toEqual({ ok: true })
  })
  it('maps ApiError to { detail } with its status', async () => {
    const res = await route(async () => { throw new ApiError(404, 'Booking not found') })(new Request('http://x'), undefined)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ detail: 'Booking not found' })
  })
  it('turns validation errors into 400 and hides internals on 500', async () => {
    const bad = await route(async (req) => parseJson(req, z.object({ n: z.number() })))(
      new Request('http://x', { method: 'POST', body: '{"n":"x"}' }), undefined)
    expect(bad.status).toBe(400)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = await route(async () => { throw new Error('db password leaked') })(new Request('http://x'), undefined)
    expect(boom.status).toBe(500)
    expect(await boom.json()).toEqual({ detail: 'Internal server error' })
  })
})
