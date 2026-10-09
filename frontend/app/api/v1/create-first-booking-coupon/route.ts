import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { createFirstBookingCoupon } from '@/server/services/coupons'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => createFirstBookingCoupon(await authenticate(req)))
