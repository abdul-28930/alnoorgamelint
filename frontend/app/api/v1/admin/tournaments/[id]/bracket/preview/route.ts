import { requireRole } from '@/server/auth'
import { parseJsonOptional, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { bracketSchema, previewBracket } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

// Shows the seeding and matches that generating would create, without saving anything.
export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  const { order } = await parseJsonOptional(req, bracketSchema)
  return previewBracket(uuidParam.parse(ctx.params.id), order)
})
