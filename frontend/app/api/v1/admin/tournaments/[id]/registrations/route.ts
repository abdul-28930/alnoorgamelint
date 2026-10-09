import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { getTournamentDetail } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

// Kept for older callers: the entrants of a tournament. The manage screen uses GET /admin/tournaments/{id}.
export const GET = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  return (await getTournamentDetail(uuidParam.parse(ctx.params.id))).entrants
})
