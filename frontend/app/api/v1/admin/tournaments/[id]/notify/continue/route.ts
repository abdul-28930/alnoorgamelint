import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { continueBroadcast, continueSchema } from '@/server/services/tournamentBroadcast'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return continueBroadcast(uuidParam.parse(ctx.params.id), (await parseJson(req, continueSchema)).batch_id)
})
