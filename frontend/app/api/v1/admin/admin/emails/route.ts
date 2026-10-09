import { requireRole } from '@/server/auth'
import { parseJson, route } from '@/server/http'
import { adminEmailsSchema, getAdminEmails, setAdminEmails } from '@/server/services/admin/catalog'

export const dynamic = 'force-dynamic'

// The doubled /admin/admin/ path is kept on purpose: it is the old URL.
export const GET = route(async (req) => {
  await requireRole(req, ['admin'])
  return getAdminEmails()
})

export const PUT = route(async (req) => {
  await requireRole(req, ['admin'])
  return setAdminEmails(await parseJson(req, adminEmailsSchema))
})
