import { requireRole } from '@/server/auth'
import { parseJsonOptional, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { bracketPdf, bracketPdfSchema } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  const id = uuidParam.parse(ctx.params.id)
  const { order } = await parseJsonOptional(req, bracketPdfSchema)
  const pdf = await bracketPdf(id, order)
  return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="tournament_bracket.pdf"' } })
})
