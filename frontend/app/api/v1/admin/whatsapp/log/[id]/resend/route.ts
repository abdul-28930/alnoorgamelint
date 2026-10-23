import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { resend } from '@/server/services/notifications'

export const dynamic = 'force-dynamic'

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  return resend(uuidParam.parse(ctx.params.id))
})
