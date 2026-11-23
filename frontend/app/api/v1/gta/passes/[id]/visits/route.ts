import { authenticate } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { bookMyVisit, visitSchema } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await authenticate(req)
  return bookMyVisit(user, uuidParam.parse(ctx.params.id), await parseJson(req, visitSchema))
})
