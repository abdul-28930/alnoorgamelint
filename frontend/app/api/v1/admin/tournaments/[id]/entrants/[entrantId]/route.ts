import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { removeEntrant, updateEntrant, updateEntrantSchema } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; entrantId: string } }

export const PUT = route(async (req, ctx: Ctx) => {
  await requireRole(req, ['staff', 'admin'])
  return updateEntrant(uuidParam.parse(ctx.params.id), uuidParam.parse(ctx.params.entrantId), await parseJson(req, updateEntrantSchema))
})

export const DELETE = route(async (req, ctx: Ctx) => {
  await requireRole(req, ['staff', 'admin'])
  return removeEntrant(uuidParam.parse(ctx.params.id), uuidParam.parse(ctx.params.entrantId))
})
