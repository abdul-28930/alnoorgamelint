import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { matchUpdateSchema, updateMatch } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

// Mark a match live / back to ready, schedule it, assign a station, add a note.
export const PUT = route(async (req, ctx: { params: { matchId: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  return updateMatch(uuidParam.parse(ctx.params.matchId), await parseJson(req, matchUpdateSchema))
})
