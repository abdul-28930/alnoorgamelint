import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { addEntrant, addEntrantSchema } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

// Register a player by username, or a walk-in by name.
export const POST = route(async (req, ctx: { params: { id: string } }) => {
  await requireRole(req, ['staff', 'admin'])
  return addEntrant(uuidParam.parse(ctx.params.id), await parseJson(req, addEntrantSchema))
})
