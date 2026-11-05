import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { pointsBalance, pointsBalanceQuery } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['admin'])
  return pointsBalance(parseQuery(req, pointsBalanceQuery).user_id)
})
