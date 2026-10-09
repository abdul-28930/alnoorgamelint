import { authenticate } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { rateLimit } from '@/server/rateLimit'
import { referralQuery, useReferral } from '@/server/services/coupons'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  rateLimit(req, 'use-referral', 10)
  const user = await authenticate(req)
  const { referral_code } = parseQuery(req, referralQuery)
  return useReferral(user, referral_code)
})
