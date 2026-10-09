import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { payments } from '@/server/services/admin/stats'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return payments()
})
