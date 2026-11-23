import { requireRole } from '@/server/auth'
import { parseQuery, route } from '@/server/http'
import { istDate } from '@/server/time'
import { adminSchedule } from '@/server/services/gta'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })

export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return adminSchedule(parseQuery(req, query).date ?? istDate())
})
