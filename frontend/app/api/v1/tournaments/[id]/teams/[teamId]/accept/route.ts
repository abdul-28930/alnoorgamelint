import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { acceptInvite } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string; teamId: string } }) => {
  const user = await authenticate(req)
  return acceptInvite(user.id, uuidParam.parse(ctx.params.id), uuidParam.parse(ctx.params.teamId))
})
