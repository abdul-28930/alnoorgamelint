import { authenticate } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { profileUpdateSchema, updateProfile } from '@/server/services/auth'

export const dynamic = 'force-dynamic'

export const GET = route(async (req) => {
  const { id, email, role } = await authenticate(req)
  return { id, email, role }
})

export const PUT = route(async (req) => {
  const user = await authenticate(req)
  return updateProfile(user.id, await parseJson(req, profileUpdateSchema))
})
