import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { listMyCoupons } from '@/server/services/coupons'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => listMyCoupons((await authenticate(req)).id))
