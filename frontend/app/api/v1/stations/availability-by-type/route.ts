import { parseQuery, route } from '@/server/http'
import { availabilityByType, availabilityQuery } from '@/server/services/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  const { type, date } = parseQuery(req, availabilityQuery)
  return availabilityByType(type, date)
})
