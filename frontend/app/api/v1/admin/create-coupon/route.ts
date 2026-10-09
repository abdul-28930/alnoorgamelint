import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { createCoupon, createCouponQuery } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  const admin = await requireRole(req, ['admin'])
  return createCoupon(admin.id, parseQuery(req, createCouponQuery))
})
