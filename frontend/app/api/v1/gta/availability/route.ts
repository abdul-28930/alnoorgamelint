import { parseQuery, route } from '@/server/http'
import { availabilityQuery, dayAvailability } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

// Which start times are free on a day for a visit of the given length (public).
export const GET = route(async (req) => dayAvailability(parseQuery(req, availabilityQuery)))
