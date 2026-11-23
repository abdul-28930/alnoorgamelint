import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { adminPasses } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return adminPasses()
})
