import { z } from 'zod'
import { parseQuery, route } from '@/server/http'
import { rateLimit } from '@/server/rateLimit'
import { isUsernameAvailable } from '@/server/services/auth'

export const dynamic = 'force-dynamic'

// POST with a query string, exactly as the frontend calls it.
export const POST = route(async (req) => {
  rateLimit(req, 'check-username', 60)
  const { username } = parseQuery(req, z.object({ username: z.string().trim().min(1).max(30) }))
  return isUsernameAvailable(username)
})
