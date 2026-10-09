import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { getPoints } from '@/server/services/points'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => getPoints((await authenticate(req)).id))
