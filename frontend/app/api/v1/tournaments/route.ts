import { cached, route } from '@/server/http'
import { listPublicTournaments } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

// short cache: registration counts are shown live
export const GET = route(async () => cached(await listPublicTournaments(), 5))
