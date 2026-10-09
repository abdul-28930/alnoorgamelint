# Backend

The backend is a set of **Next.js Route Handlers** inside the website app (`frontend/app/api/...`), backed by
**Supabase Postgres** and **Supabase Auth**. There is no separate server: one Vercel deploy serves the pages and the API.
It replaced an earlier Python/FastAPI service; every URL and response shape was kept, so the website code only needed
to switch to a shared client (`frontend/lib/api.ts`).

## Layout

```
frontend/
├── app/api/v1/...        one folder per endpoint, each a thin route.ts
├── app/api/cron/         scheduled job (reminders + booking status refresh)
└── server/               server-only code
    ├── auth.ts           verify the user's token, look up the role (cached 60 s)
    ├── http.ts           route() wrapper, { detail } errors, zod parsing
    ├── pricing.ts        prices, discounts, refunds, prepaid billing (integer paise)
    ├── time.ts           IST helpers
    ├── status.ts         live booking status from the clock
    ├── receipt.ts        PDF receipt (pdf-lib + bundled DejaVu font so the rupee sign renders)
    ├── mailer.ts         SMTP email (never throws; reports whether it sent)
    ├── rateLimit.ts      best-effort per-instance limiter for signup / lookups
    └── services/         business logic; services/admin/ for staff features
```

## Security model

- **Every request is authenticated by verifying the Supabase JWT** (signature, expiry, audience): public keys from
  the project's JWKS, or the legacy `SUPABASE_JWT_SECRET` for HS256 projects. Tokens are never trusted unverified.
- **Roles**: `user` (default), `staff`, `admin`. A row in `user_roles` wins; otherwise an email listed in
  `admin_settings.admin_emails` is an admin. A failed role lookup returns 503 rather than silently demoting anyone.
- The server uses the **service-role key**, which bypasses row level security, so authorisation lives in the route
  handlers (`authenticate` / `requireRole`). RLS (`03_security_storage.sql`) still protects the few tables the
  browser queries directly (stations, profiles, profile pictures).
- Database functions the API calls are not executable by `anon` / `authenticated`.
- No CORS configuration: the API is same-origin.

## Conventions

- **Errors** are `{ "detail": "message" }` with a sensible status (400 validation, 401 not signed in, 403 wrong role,
  404, 429 rate limited, 503 when the database is unreachable). Unexpected errors are logged server-side and returned
  as a generic 500.
- **Times** are Indian Standard Time everywhere. Booking `start_at` / `end_at` are text `YYYY-MM-DD HH:MM:SS` (IST wall
  clock) and `start_time` / `end_time` are `HH:MM` (see `server/time.ts`). The server's own timezone does not matter.
- **Money** is computed in integer paise and rounded once (`server/pricing.ts`).
- **Reservations**: the customer site books a whole day with no `start_time`; staff check the booking in at a
  station and the real start/end are set then. Bookings with a `start_time` are timed slots.
- **Booking status** (`UPCOMING`, `ONGOING`, `ENDED`, `CANCELLED`, plus `PENDING` for reservations) is derived from the
  clock on read and persisted by the scheduled job. A checked-in session stays `ONGOING` until staff stop it.
- **Prepaid cards and advance payments** have no payment gateway: a customer's request is created `PENDING`, staff take the
  money at the counter and confirm it in the admin panel (Settings -> Pending Neo Card Requests; booking payment screen).

## Database

Run `sql/setup/01_tables.sql` ... `07_reminders_rpcs.sql` in order (README has the list). Anything that must be atomic is
a SQL function so two simultaneous requests cannot both succeed: `create_booking` (slot check + coupon + insert),
`cancel_booking`, `checkin_booking`, `stop_timer`, `extend_booking_hour`, `confirm_prepaid_card`, plus the dashboard
aggregates and the reminder queries.

## Environment variables (server only unless noted)

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser client (public) |
| `SUPABASE_URL` | optional; defaults to `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | the API's database access (keep secret) |
| `SUPABASE_JWT_SECRET` | only for legacy HS256 projects |
| `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | booking and reminder emails (optional) |
| `CRON_SECRET` | protects `/api/cron/reminders` |

## Scheduled job

`/api/cron/reminders` must be called every 5 minutes; see [`reminders-cron.md`](reminders-cron.md).

## Endpoints

Generated from the route files. "staff / admin" means either role; "signed-in user" means any valid token.

| Method | Path | Who |
|---|---|---|
| GET | `/api/cron/reminders` | cron secret |
| POST | `/api/cron/reminders` | cron secret |
| GET | `/api/v1/admin/admin/emails` | admin |
| PUT | `/api/v1/admin/admin/emails` | admin |
| GET | `/api/v1/admin/all-coupons` | admin |
| GET | `/api/v1/admin/bookings` | staff / admin |
| GET | `/api/v1/admin/bookings/by-date` | staff / admin |
| GET | `/api/v1/admin/bookings/calendar` | staff / admin |
| GET | `/api/v1/admin/bookings/cancelled` | staff / admin |
| PUT | `/api/v1/admin/bookings/{id}` | staff / admin |
| POST | `/api/v1/admin/bookings/{id}/checkin` | staff / admin |
| POST | `/api/v1/admin/bookings/{id}/extend-hour` | staff / admin |
| PUT | `/api/v1/admin/bookings/{id}/payment` | staff / admin |
| GET | `/api/v1/admin/bookings/{id}/receipt` | staff / admin |
| POST | `/api/v1/admin/bookings/{id}/start-grace` | staff / admin |
| POST | `/api/v1/admin/bookings/{id}/timer/start` | staff / admin |
| POST | `/api/v1/admin/bookings/{id}/timer/stop` | staff / admin |
| POST | `/api/v1/admin/create-coupon` | admin |
| GET | `/api/v1/admin/food-items` | staff / admin |
| PUT | `/api/v1/admin/food-items` | admin |
| GET | `/api/v1/admin/points/transactions` | admin |
| GET | `/api/v1/admin/prepaid/cards` | staff / admin |
| POST | `/api/v1/admin/prepaid/cards/{id}/confirm` | staff / admin |
| GET | `/api/v1/admin/prepaid/plans` | staff / admin |
| POST | `/api/v1/admin/prepaid/plans` | staff / admin |
| DELETE | `/api/v1/admin/prepaid/plans/{id}` | staff / admin |
| GET | `/api/v1/admin/stations/reservations` | staff / admin |
| GET | `/api/v1/admin/stats/payments` | staff / admin |
| GET | `/api/v1/admin/stats/summary` | staff / admin |
| GET | `/api/v1/admin/tournaments` | admin |
| POST | `/api/v1/admin/tournaments` | admin |
| GET | `/api/v1/admin/tournaments/{id}/registrations` | admin |
| PUT | `/api/v1/admin/tournaments/{id}/status` | admin |
| POST | `/api/v1/admin/user-profiles` | staff / admin |
| GET | `/api/v1/admin/users` | admin |
| POST | `/api/v1/auth/check-username` | public |
| POST | `/api/v1/auth/login-with-username` | public |
| GET | `/api/v1/auth/profile` | signed-in user |
| PUT | `/api/v1/auth/profile` | signed-in user |
| POST | `/api/v1/auth/signup` | public |
| GET | `/api/v1/bookings` | signed-in user |
| POST | `/api/v1/bookings` | signed-in user |
| DELETE | `/api/v1/bookings/{id}` | signed-in user |
| POST | `/api/v1/create-first-booking-coupon` | signed-in user |
| GET | `/api/v1/my-coupons` | signed-in user |
| POST | `/api/v1/points/redeem/{rewardId}` | signed-in user |
| GET | `/api/v1/points/rewards` | public |
| GET | `/api/v1/prepaid/balance` | signed-in user |
| GET | `/api/v1/prepaid/my-cards` | signed-in user |
| GET | `/api/v1/prepaid/plans` | public |
| POST | `/api/v1/prepaid/purchase` | signed-in user |
| GET | `/api/v1/stations` | public |
| GET | `/api/v1/stations/availability-by-type` | public |
| GET | `/api/v1/tournaments` | public |
| POST | `/api/v1/tournaments/{id}/register` | signed-in user |
| POST | `/api/v1/use-referral` | signed-in user |
| GET | `/api/v1/user/points` | signed-in user |
| GET | `/api/v1/user/points/history` | signed-in user |
| POST | `/api/v1/validate-coupon` | signed-in user |

## Testing

```bash
cd frontend
npm test          # unit tests (pricing, time, auth, every service, receipt PDF, cron job)
npx tsc --noEmit  # types
npm run build     # production build
```

The SQL functions were exercised on a local Postgres (including a concurrent double-booking attempt). Run the files
twice on a fresh database to confirm they are safe to re-run.
