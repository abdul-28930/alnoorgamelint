# Booking reminders and status refresh (scheduled job)

The app sends "your session starts soon" emails (1 hour, 30 minutes, 5 minutes before) and keeps stored
booking statuses (`UPCOMING` -> `ONGOING` -> `ENDED`) up to date. Both happen in one endpoint that
something must call **every 5 minutes**:

```
GET or POST  https://YOUR-APP.vercel.app/api/cron/reminders
Authorization: Bearer <CRON_SECRET>
```

Vercel's free (Hobby) plan can only run a cron job once a day, so use one of the free options below.
Without a scheduler nothing breaks, but no reminder emails go out and stored statuses only update when
something else touches them (booking lists always show the correct live status regardless).

## 1. One-time setup

1. Create a secret: `openssl rand -hex 32` (any long random string works).
2. In Vercel -> Project -> Settings -> Environment Variables add (server-side, **no** `NEXT_PUBLIC_` prefix):

   | Name | Value |
   |---|---|
   | `CRON_SECRET` | the secret from step 1 |
   | `SMTP_SERVER` / `SMTP_PORT` | e.g. `smtp.gmail.com` / `587` |
   | `SMTP_USERNAME` / `SMTP_PASSWORD` | the sending mailbox (for Gmail, an app password) |

3. Redeploy so the variables apply.
4. In the Supabase SQL editor run `sql/setup/07_reminders_rpcs.sql` (after `01`-`06`).
5. Test it by hand:

   ```bash
   curl -i -X POST https://YOUR-APP.vercel.app/api/cron/reminders \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

   Expect `200` and JSON like
   `{"statuses":{"started":0,"ended":0},"reminders":{"due":0,"sent":0,"failed":0,"no_email":0}}`.
   Without the header you get `401`. If SMTP variables are missing the response contains
   `"skipped":"SMTP not configured"` (statuses are still refreshed).

## 2. Pick a scheduler (free)

### A. cron-job.org (simplest)
1. Create a free account and a new cron job.
2. URL: `https://YOUR-APP.vercel.app/api/cron/reminders`, schedule: every 5 minutes.
3. Under Advanced: request method `POST`, add header `Authorization` = `Bearer YOUR_CRON_SECRET`.
4. Turn on failure notifications so you hear about it if the app returns an error.

### B. Supabase `pg_cron` + `pg_net` (no third party)
Enable the `pg_cron` and `pg_net` extensions (Dashboard -> Database -> Extensions), then run:

```sql
select cron.schedule(
  'noor-reminders',
  '*/5 * * * *',
  $$ select net.http_post(
       url     := 'https://YOUR-APP.vercel.app/api/cron/reminders',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
     ); $$
);
```

Check runs with `select * from cron.job_run_details order by start_time desc limit 5;` and remove it
with `select cron.unschedule('noor-reminders');`. The secret is stored in the job definition, so
treat database access as sensitive (or keep it in Supabase Vault).

### C. Vercel Pro
Add `vercel.json` with `{"crons":[{"path":"/api/cron/reminders","schedule":"*/5 * * * *"}]}`.
Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
**Do not add this on the Hobby plan: a schedule more frequent than daily makes the deployment fail.**

## 3. How it behaves

- **Windows.** A booking gets at most one reminder per run, for the closest window it is inside: within 5 min,
  within 30 min, or within 60 min. Sending a closer reminder retires the wider ones, so a booking made
  20 minutes ahead gets a single "30 minutes" email. (The old job only matched a 2-minute slice, so a 5-minute
  schedule missed most bookings.)
- **Only real sends count.** A reminder is marked sent only after the email actually went out; if SMTP fails
  the next run retries it. Bookings whose start time has passed are not reminded.
- **Reservations** (no fixed time yet) are never reminded; they get a time at check-in.
- **Limits.** Up to 50 reminders per run, 5 emails in parallel. The 5-minute schedule drains any backlog.
- **Times** are Indian Standard Time throughout, independent of the server's clock.
- **Statuses.** Each run also moves bookings `UPCOMING` -> `ONGOING` -> `ENDED`. A session that staff
  checked in stays `ONGOING` past its end until staff stop it.
