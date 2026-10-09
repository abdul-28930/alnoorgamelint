import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { foodItemsSchema, listFoodItems, replaceFoodItems } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return listFoodItems()
})

export const PUT = route(async (req) => {
  await requireRole(req, ['admin'])
  return replaceFoodItems(await parseJson(req, foodItemsSchema))
})
