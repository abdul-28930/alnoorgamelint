import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { registerForTournament } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await authenticate(req)
  return registerForTournament(user.id, uuidParam.parse(ctx.params.id))
})
