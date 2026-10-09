import { authenticate } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { inviteSchema, inviteToTeam } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string; teamId: string } }) => {
  const user = await authenticate(req)
  return inviteToTeam(user.id, uuidParam.parse(ctx.params.id), uuidParam.parse(ctx.params.teamId), await parseJson(req, inviteSchema))
})
