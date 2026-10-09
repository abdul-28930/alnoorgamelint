import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { profilesByIds, userIdsSchema } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return profilesByIds(await parseJson(req, userIdsSchema))
})
