import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { moveEntrantToDay, moveSchema } from '@/server/services/admin/tournamentDays'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string; entrantId: string } }) => {
  await requireRole(req, ['admin'])
  uuidParam.parse(ctx.params.id)
  return moveEntrantToDay(uuidParam.parse(ctx.params.entrantId), await parseJson(req, moveSchema))
})
