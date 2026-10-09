import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { recordView, viewSchema } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const body = await parseJson(req, viewSchema)
  return recordView(uuidParam.parse(ctx.params.id), body.visitor_id)
})
