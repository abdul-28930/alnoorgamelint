import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { deleteTournament, getTournamentDetail, tournamentUpdateSchema, updateTournament } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = route(async (req, ctx: Ctx) => {
  await requireRole(req, ['staff', 'admin'])
  return getTournamentDetail(uuidParam.parse(ctx.params.id))
})

export const PUT = route(async (req, ctx: Ctx) => {
  await requireRole(req, ['admin'])
  return updateTournament(uuidParam.parse(ctx.params.id), await parseJson(req, tournamentUpdateSchema))
})

export const DELETE = route(async (req, ctx: Ctx) => {
  await requireRole(req, ['admin'])
  return deleteTournament(uuidParam.parse(ctx.params.id))
})
