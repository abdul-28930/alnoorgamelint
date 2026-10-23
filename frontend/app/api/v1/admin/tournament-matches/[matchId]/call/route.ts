import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { callMatchPlayers } from '@/server/services/tournamentBroadcast'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const POST = route(async (req, ctx: { params: { matchId: string } }) => {
  const user = await requireRole(req, ['staff', 'admin'])
  return callMatchPlayers(uuidParam.parse(ctx.params.matchId), user.id)
})
