import { requireRole } from '@/server/auth'
import { parseJsonOptional, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { splitSchema, splitTournament } from '@/server/services/admin/tournamentDays'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return splitTournament(uuidParam.parse(ctx.params.id), await parseJsonOptional(req, splitSchema))
})
