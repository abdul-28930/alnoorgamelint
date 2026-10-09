import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { setTournamentStatus, tournamentStatusQuery } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

export const PUT = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return setTournamentStatus(uuidParam.parse(ctx.params.id), parseQuery(req, tournamentStatusQuery).status)
})
