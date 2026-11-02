import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { swapSchema, swapWaitlistIntoBracket } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return swapWaitlistIntoBracket(uuidParam.parse(ctx.params.id), await parseJson(req, swapSchema))
})
