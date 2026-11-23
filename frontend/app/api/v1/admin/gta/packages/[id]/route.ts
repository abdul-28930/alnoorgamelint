import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { deletePackage, packageUpdateSchema, updatePackage } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const PUT = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return updatePackage(uuidParam.parse(ctx.params.id), await parseJson(req, packageUpdateSchema))
})

export const DELETE = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return deletePackage(uuidParam.parse(ctx.params.id))
})
