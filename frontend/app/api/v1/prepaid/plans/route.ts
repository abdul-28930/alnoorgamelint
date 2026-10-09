import { cached, route } from '@/server/http'
import { listPrepaidPlans } from '@/server/services/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async () => cached(await listPrepaidPlans()))
