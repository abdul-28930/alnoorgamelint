import { requireRole } from '@/server/auth'
import { badRequest, parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { addOnPackage, addonSchema, adminBookVisit, passFoodSchema, paymentSchema, payPass, setFoodServed, staffVisitSchema } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

// POST /admin/gta/passes/{id}/visits | payment | addon | food
export const POST = route(async (req, ctx: { params: { id: string; action: string } }) => {
  const staff = await requireRole(req, ['staff', 'admin'])
  const id = uuidParam.parse(ctx.params.id)
  switch (ctx.params.action) {
    case 'visits': return adminBookVisit(id, await parseJson(req, staffVisitSchema))
    case 'payment': return payPass(id, await parseJson(req, paymentSchema))
    case 'addon': return addOnPackage(id, await parseJson(req, addonSchema), staff)
    case 'food': return setFoodServed(id, (await parseJson(req, passFoodSchema)).food_served)
    default: throw badRequest('Unknown action')
  }
})
