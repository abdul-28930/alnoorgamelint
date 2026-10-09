import { describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { verifyAccessToken, bearerToken } from '../auth'
import { ApiError } from '../http'

const secret = new TextEncoder().encode('test-secret-test-secret-test-secret-123')
const sign = (key: Uint8Array, claims: Record<string, unknown> = {}, exp = '1h', aud = 'authenticated') =>
  new SignJWT({ email: 'a@b.com', ...claims }).setProtectedHeader({ alg: 'HS256' }).setSubject('user-1').setAudience(aud).setExpirationTime(exp).sign(key)

describe('verifyAccessToken', () => {
  it('accepts a correctly signed token', async () => {
    expect(await verifyAccessToken(await sign(secret), secret)).toEqual({ id: 'user-1', email: 'a@b.com' })
  })
  it('rejects a forged signature (the old backend accepted these)', async () => {
    const forged = await sign(new TextEncoder().encode('attacker-secret-attacker-secret-1234'), { email: 'admin@x.com' })
    await expect(verifyAccessToken(forged, secret)).rejects.toMatchObject({ status: 401 })
  })
  it('rejects expired tokens and wrong audience', async () => {
    await expect(verifyAccessToken(await sign(secret, {}, '-1h'), secret)).rejects.toBeInstanceOf(ApiError)
    await expect(verifyAccessToken(await sign(secret, {}, '1h', 'anon'), secret)).rejects.toMatchObject({ status: 401 })
  })
  it('rejects unsigned (alg none) tokens', async () => {
    const none = `${btoa('{"alg":"none"}')}.${btoa('{"sub":"u","aud":"authenticated"}')}.`
    await expect(verifyAccessToken(none, secret)).rejects.toMatchObject({ status: 401 })
  })
})

describe('bearerToken', () => {
  it('extracts the token', () => {
    expect(bearerToken(new Request('http://x', { headers: { authorization: 'Bearer abc' } }))).toBe('abc')
  })
  it('401s when missing or malformed', () => {
    expect(() => bearerToken(new Request('http://x'))).toThrow(ApiError)
    expect(() => bearerToken(new Request('http://x', { headers: { authorization: 'Basic abc' } }))).toThrow(ApiError)
  })
})
