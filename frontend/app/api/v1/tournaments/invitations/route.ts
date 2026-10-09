import { authenticate } from '@/server/auth'
import { route } from '@/server/http'
import { myInvitations } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => myInvitations((await authenticate(req)).id))
