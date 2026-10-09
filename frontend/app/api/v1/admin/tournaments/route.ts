import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { createTournament, listTournaments, tournamentSchema } from '@/server/services/admin/tournaments'

export const dynamic = 'force-dynamic'

// Each tournament comes with its live registered / waitlist counts and view count.
export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return listTournaments()
})

export const POST = route(async (req) => {
  await requireRole(req, ['admin'])
  return createTournament(await parseJson(req, tournamentSchema))
})
