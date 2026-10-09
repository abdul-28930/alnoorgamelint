import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { checkin, checkinQuery } from '@/server/services/admin/operations'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  return checkin(uuidParam.parse(ctx.params.id), parseQuery(req, checkinQuery).station_id)
})
