import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { tournamentRegistrations } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return tournamentRegistrations(uuidParam.parse(ctx.params.id))
})
