import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { reportResult, resultSchema, undoResult } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

type Ctx = { params: { matchId: string } }

// Won / Lost: { winner_id } and/or { score1, score2 }; { walkover: true } awards the match without play.
export const PUT = route(async (req, ctx: Ctx) => {
  await requireRole(req, ['staff', 'admin'])
  return reportResult(uuidParam.parse(ctx.params.matchId), await parseJson(req, resultSchema))
})

export const DELETE = route(async (req, ctx: Ctx) => {
  await requireRole(req, ['staff', 'admin'])
  return undoResult(uuidParam.parse(ctx.params.matchId))
})
