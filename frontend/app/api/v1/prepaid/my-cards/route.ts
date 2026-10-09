import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { listMyCards } from '@/server/services/prepaid'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => listMyCards((await authenticate(req)).id))
