import { authenticate } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { purchasePlan, purchaseQuery } from '@/server/services/prepaid'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  const user = await authenticate(req)
  const { plan_id } = parseQuery(req, purchaseQuery)
  return purchasePlan(user.id, plan_id)
})
