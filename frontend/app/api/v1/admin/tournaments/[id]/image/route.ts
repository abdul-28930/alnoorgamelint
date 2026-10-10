import { requireRole } from '@/server/auth'
import { badRequest, parseQuery, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { imageKind, removeTournamentImage, setTournamentImage } from '@/server/services/admin/tournaments'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const query = z.object({ kind: imageKind })

/** multipart form with one `file` field; ?kind=banner|poster */
export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  const { kind } = parseQuery(req, query)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw badRequest('Choose an image')
  return setTournamentImage(uuidParam.parse(ctx.params.id), kind, new Uint8Array(await file.arrayBuffer()))
})

export const DELETE = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  const { kind } = parseQuery(req, query)
  return removeTournamentImage(uuidParam.parse(ctx.params.id), kind)
})
