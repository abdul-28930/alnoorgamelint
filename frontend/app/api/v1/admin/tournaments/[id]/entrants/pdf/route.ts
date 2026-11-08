import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { entrantsPdf, entrantsPdfQuery } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

export const GET = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  const id = uuidParam.parse(ctx.params.id)
  const { list } = parseQuery(req, entrantsPdfQuery)
  const pdf = await entrantsPdf(id, list)
  return new Response(pdf, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="tournament_players_${list}.pdf"` },
  })
})
