import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { cancelMyVisit } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await authenticate(req)
  return cancelMyVisit(user, uuidParam.parse(ctx.params.id))
})
