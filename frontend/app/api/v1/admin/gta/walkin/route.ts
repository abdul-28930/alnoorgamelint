import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { adminWalkin, walkinSchema } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  const staff = await requireRole(req, ['staff', 'admin'])
  return adminWalkin(await parseJson(req, walkinSchema), staff)
})
