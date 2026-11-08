import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { generateSchedule, generateScheduleSchema, getScheduleSettings } from '@/server/services/admin/schedule'

export const dynamic = 'force-dynamic'

export const GET = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return getScheduleSettings(uuidParam.parse(ctx.params.id))
})

/** Saves the settings and plans (or re-plans from now) every match still to be played. */
export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  return generateSchedule(uuidParam.parse(ctx.params.id), await parseJson(req, generateScheduleSchema))
})
