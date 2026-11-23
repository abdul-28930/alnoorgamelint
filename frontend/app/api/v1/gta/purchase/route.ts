import { authenticate } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { buyPackage, buySchema } from '@/server/services/gta'

export const dynamic = 'force-dynamic'

export const POST = route(async (req) => {
  const user = await authenticate(req)
  return buyPackage(user, await parseJson(req, buySchema))
})
