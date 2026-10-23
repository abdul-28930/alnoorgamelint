import { requireRole } from '@/server/auth'
import { route } from '@/server/http'
import { getAdminStatus } from '@/server/services/notifications'

export const dynamic = 'force-dynamic'

/** ?check=1 also asks the WhatsApp service whether the account is valid (one extra call) */
export const GET = route(async (req) => {
  await requireRole(req, ['staff', 'admin'])
  return getAdminStatus({ check: new URL(req.url).searchParams.get('check') === '1' })
})
