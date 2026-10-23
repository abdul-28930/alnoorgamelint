import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { broadcastSchema, startBroadcast } from '@/server/services/tournamentBroadcast'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireRole(req, ['admin'])
  return startBroadcast(uuidParam.parse(ctx.params.id), await parseJson(req, broadcastSchema), user.id)
})
