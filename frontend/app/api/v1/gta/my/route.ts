import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { myPasses } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => myPasses(await authenticate(req)))
