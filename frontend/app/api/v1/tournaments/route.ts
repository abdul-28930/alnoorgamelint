import { cached, route } from '@/server/http'
import { listOpenTournaments } from '@/server/services/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async () => cached(await listOpenTournaments()))
