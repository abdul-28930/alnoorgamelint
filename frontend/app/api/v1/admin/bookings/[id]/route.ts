import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { updateBooking, updateBookingSchema } from '@/server/services/admin/bookings'

export const dynamic = 'force-dynamic'

export const PUT = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  return updateBooking(uuidParam.parse(ctx.params.id), await parseJson(req, updateBookingSchema))
})
