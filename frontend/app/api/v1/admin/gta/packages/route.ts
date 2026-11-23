import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { createPackage, listPackages, packageSchema } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return listPackages(undefined, { all: true })
})

export const POST = route(async (req) => {
  await requireRole(req, ['admin'])
  return createPackage(await parseJson(req, packageSchema))
})
