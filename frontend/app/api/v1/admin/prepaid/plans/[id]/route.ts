import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { deletePlan } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const DELETE = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  return deletePlan(uuidParam.parse(ctx.params.id))
})
