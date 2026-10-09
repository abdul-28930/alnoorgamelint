import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { leaveTeam } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

/** Decline an invitation, leave the team, or (as captain) disband it. */
export const DELETE = route(async (req, ctx: { params: { id: string; teamId: string } }) => {
  const user = await authenticate(req)
  return leaveTeam(user.id, uuidParam.parse(ctx.params.id), uuidParam.parse(ctx.params.teamId))
})
