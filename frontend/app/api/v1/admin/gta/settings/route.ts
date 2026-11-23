import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { getSettings, settingsSchema, updateSettings } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return getSettings()
})

export const PUT = route(async (req) => {
  await requireRole(req, ['admin'])
  return updateSettings(await parseJson(req, settingsSchema))
})
