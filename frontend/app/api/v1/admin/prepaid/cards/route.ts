import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { cardsQuery, listCards } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return listCards(parseQuery(req, cardsQuery).status)
})
