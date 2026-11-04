import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { adjustPoints, pointsAdjustSchema } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  const user = await requireRole(req, ['admin'])
  return adjustPoints(await parseJson(req, pointsAdjustSchema), user.email)
})
