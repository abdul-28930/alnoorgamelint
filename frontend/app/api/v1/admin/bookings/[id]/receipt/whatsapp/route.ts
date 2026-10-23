import { requireRole } from '@/server/auth'
import { parseJsonOptional, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { receiptSendSchema, sendReceiptOnWhatsapp } from '@/server/services/receiptWhatsapp'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireRole(req, ['staff', 'admin'])
  return sendReceiptOnWhatsapp(uuidParam.parse(ctx.params.id), await parseJsonOptional(req, receiptSendSchema), user.id)
})
