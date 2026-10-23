import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { sendTest, testSendSchema } from '@/server/services/notifications'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  const user = await requireRole(req, ['admin'])
  return sendTest(await parseJson(req, testSendSchema), user.id)
})
