import { parseJson, route } from '@/server/http'
import { rateLimit } from '@/server/rateLimit'
import { loginLookupSchema, resolveLoginEmail } from '@/server/services/auth'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  rateLimit(req, 'login-lookup', 20)
  const { email_or_username } = await parseJson(req, loginLookupSchema)
  return resolveLoginEmail(email_or_username)
})
