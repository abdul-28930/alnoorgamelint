import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { listPlans, planSchema, savePlan } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return listPlans()
})

export const POST = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return savePlan(await parseJson(req, planSchema))
})
