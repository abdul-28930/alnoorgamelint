import { requireCronSecret } from '@/server/auth'
import { route } from '@/server/http'
import { retryFailedNotifications } from '@/server/services/notifications'
import { runCron } from '@/server/services/reminders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// Call every 5 minutes with `Authorization: Bearer $CRON_SECRET`.
// GET is what Vercel Cron sends; POST suits external schedulers (cron-job.org, pg_net, ...).
const handler = route(async (req) => {
  requireCronSecret(req)
  const result = await runCron()
  // WhatsApp messages that clearly failed get another try (best effort: never fails the reminder run)
  const whatsapp = await retryFailedNotifications().catch(() => ({ retried: 0, sent: 0 }))
  return { ...result, whatsapp }
})

export const GET = handler
export const POST = handler
