import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { pointsHistory } from '@/server/services/points'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => pointsHistory((await authenticate(req)).id))
