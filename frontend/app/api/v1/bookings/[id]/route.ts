import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { cancelBooking, uuidParam } from '@/server/services/bookings'

export const dynamic = 'force-dynamic'

export const DELETE = route(async (req, ctx: { params: { id: string } }) => {
  const user = await authenticate(req)
  return cancelBooking(uuidParam.parse(ctx.params.id), user.id)
})
