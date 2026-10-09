import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { createTournament, listAllTournaments, tournamentSchema } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  await requireRole(req, ['admin'])
  return listAllTournaments()
})

export const POST = route(async (req) => {
  await requireRole(req, ['admin'])
  return createTournament(await parseJson(req, tournamentSchema))
})
