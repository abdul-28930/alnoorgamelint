import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { calendar, calendarQuery } from '@/server/services/admin/bookings'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return calendar(parseQuery(req, calendarQuery))
})
