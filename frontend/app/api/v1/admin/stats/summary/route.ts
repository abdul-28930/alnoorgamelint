import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { statsQuery, summary } from '@/server/services/admin/stats'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return summary(parseQuery(req, statsQuery))
})
