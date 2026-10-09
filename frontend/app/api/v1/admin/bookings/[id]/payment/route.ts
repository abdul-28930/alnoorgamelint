import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { paymentSchema, recordPayment } from '@/server/services/admin/bookings'

export const dynamic = 'force-dynamic'

export const PUT = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  const { amount_paid } = await parseJson(req, paymentSchema)
  return recordPayment(uuidParam.parse(ctx.params.id), amount_paid)
})
