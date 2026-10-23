import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { listLog, logQuery } from '@/server/services/notifications'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return listLog(parseQuery(req, logQuery))
})
