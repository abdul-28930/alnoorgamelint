import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { templateUpdateSchema, updateTemplate } from '@/server/services/notifications'

export const dynamic = 'force-dynamic'

export const PUT = route(async (req, ctx: { params: { event: string } }) => {
  await requireRole(req, ['admin'])
  return updateTemplate(ctx.params.event, await parseJson(req, templateUpdateSchema))
})
