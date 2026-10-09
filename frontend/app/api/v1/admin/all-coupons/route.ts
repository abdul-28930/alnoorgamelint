import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { listAllCoupons } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['admin'])
  return listAllCoupons()
})
