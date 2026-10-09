import { parseJson, route } from '@/server/http'
import { rateLimit } from '@/server/rateLimit'
import { signup, signupSchema } from '@/server/services/auth'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  rateLimit(req, 'signup', 10)
  return signup(await parseJson(req, signupSchema))
})
