import { authenticate } from '@/server/auth'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** Lets the admin screens ask the server (the only place roles are enforced) whether to show themselves. */
export const GET = route(async (req) => {
  const user = await authenticate(req)
  return { is_admin: user.role === 'admin' || user.role === 'staff', role: user.role }
})
