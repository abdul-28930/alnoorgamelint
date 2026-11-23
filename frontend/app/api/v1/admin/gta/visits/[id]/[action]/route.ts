import { requireRole } from '@/server/auth'
import { badRequest, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { visitAction, visitActionSchema } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

// POST /admin/gta/visits/{id}/start | stop | cancel
export const POST = route(async (req, ctx: { params: { id: string; action: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  const action = visitActionSchema.safeParse(ctx.params.action)
  if (!action.success) throw badRequest('Unknown action')
  return visitAction(uuidParam.parse(ctx.params.id), action.data)
})
