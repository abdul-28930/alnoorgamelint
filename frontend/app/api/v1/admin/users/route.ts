import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { listUsers, usersQuery } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['admin'])
  return listUsers(parseQuery(req, usersQuery))
})
