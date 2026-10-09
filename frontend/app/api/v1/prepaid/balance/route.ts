import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { getBalance } from '@/server/services/prepaid'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => getBalance((await authenticate(req)).id))
