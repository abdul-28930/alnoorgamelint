import { authenticate } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { couponCodeQuery, validateCoupon } from '@/server/services/coupons'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  const user = await authenticate(req)
  const { coupon_code } = parseQuery(req, couponCodeQuery)
  return validateCoupon(user, coupon_code)
})
