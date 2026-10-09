import { requireCronSecret } from '@/server/auth'
import { route } from '@/server/http'
import { runCron } from '@/server/services/reminders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// Call every 5 minutes with `Authorization: Bearer $CRON_SECRET`.
// GET is what Vercel Cron sends; POST suits external schedulers (cron-job.org, pg_net, ...).
const handler = route(async (req) => {
  requireCronSecret(req)
  return runCron()
})

export const GET = handler
export const POST = handler
