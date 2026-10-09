import { requireRole } from '@/server/auth'
import { parseJsonOptional, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { bracketSchema, startBracket } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

// Generate the bracket (or league fixtures) and start the tournament. Body: { order?: entrantId[] } (seed 1 first);
// without it the tournament's seeding mode decides. Allowed again until the first match is played.
export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin'])
  const { order } = await parseJsonOptional(req, bracketSchema)
  return startBracket(uuidParam.parse(ctx.params.id), order)
})
