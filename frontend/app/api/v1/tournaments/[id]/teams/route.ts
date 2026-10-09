import { authenticate } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { createTeam, teamSchema } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await authenticate(req)
  return createTeam(user.id, uuidParam.parse(ctx.params.id), await parseJson(req, teamSchema))
})
