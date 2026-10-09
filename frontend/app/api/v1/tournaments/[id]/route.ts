import { tryAuthenticate } from '@/server/auth'
import { route } from '@/server/http'
import { uuidParam } from '@/server/services/bookings'
import { getPublicTournament } from '@/server/services/tournaments'

export const dynamic = 'force-dynamic'

export const GET = route(async (req, ctx: { params: { id: string } }) => {
  const user = await tryAuthenticate(req)
  return getPublicTournament(uuidParam.parse(ctx.params.id), user?.id ?? null)
})
