import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { extendHour } from '@/server/services/admin/operations'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  return extendHour(uuidParam.parse(ctx.params.id))
})
