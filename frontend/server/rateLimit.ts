import 'server-only'
import { ApiError } from './http'

const buckets = new Map<string, number[]>()

/**
 * Best-effort sliding-window limiter, per server instance (serverless instances do not share
 * memory, so this blunts bursts and enumeration scripts but is not a hard guarantee).
 */
export function rateLimit(req: Request, name: string, limit: number, windowMs = 60_000, now = Date.now()): void {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const key = `${name}:${ip}`
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    throw new ApiError(429, 'Too many requests, please try again shortly')
  }
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > 5000) {
    buckets.forEach((v, k) => {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k)
    })
  }
}
