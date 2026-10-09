import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { bookingsByDate, dateQuery } from '@/server/services/admin/bookings'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return bookingsByDate(parseQuery(req, dateQuery).date)
})
