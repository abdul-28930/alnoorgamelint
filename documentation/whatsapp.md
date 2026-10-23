# WhatsApp messages

Messages go through Ten Digit / My Dreams Technology (`sendtemplate.php`). Only approved templates can start a conversation,
so every message is a template whose variables the server fills in.

## Setup
1. Run `sql/setup/13_whatsapp.sql` in Supabase (tables `whatsapp_templates`, `notification_log`, and `user_profiles.whatsapp_opt_in`).
2. Set on the server (Vercel env, never `NEXT_PUBLIC_`): `WHATSAPP_LICENSE_NUMBER`, `WHATSAPP_API_KEY`
   (optional `WHATSAPP_API_BASE`, `WHATSAPP_ENABLED=false` to stop sending). The key travels in the request URL, so it is
   never logged or returned by the app; errors are scrubbed of it.
3. Create and get approved the templates below (Utility, English). Then in **Admin > WhatsApp** check the names match, press
   "Check account", and "Send test" to your own number.

## Messages and variables
The order of the variables is the order of `{{1}}`, `{{2}}`... in the approved template (defined in `server/whatsapp/events.ts`).

| Message (event) | Template | Variables | Extra |
|---|---|---|---|
| `reservation_received` | `reservation_received` | name, station_type, date, amount, reference | |
| `booking_confirmed` | `booking_confirmed` | name, station, date, time, hours, amount, reference | |
| `receipt_ready` | `receipt_ready` | name, reference, amount | PDF in the header (`Fileurl`, `PDFName`) |
| `tournament_registered` | `tournament_registered` | name, tournament, status, starts | button link ends with the tournament id (`URLParam`) |
| `tournament_waitlist_moved_up` | `tournament_waitlist_moved_up` | name, tournament | button as above |
| `tournament_update` | `tournament_update` | name, tournament, message | button as above |
| `match_call` | `match_call` | name, tournament | |

Variables must be one tidy line: the app removes commas, line breaks and repeated spaces, and sends `-` for an empty value
(WhatsApp rejects empty ones). A template's name and on/off switch can be changed in Admin > WhatsApp without a deploy.

## How sending behaves
- `notify()` runs after the real action succeeded and **never throws**: a booking or sign-up is never stopped by WhatsApp.
- Every message is written to `notification_log` first. `dedupe_key` is unique, so the same event for the same booking or
  registration is never sent twice.
- Skipped (and logged with the reason): WhatsApp not configured is silent; message switched off; no valid Indian mobile number;
  the member turned WhatsApp off (`whatsapp_opt_in = false`).
- The provider's reply format was not documented, so it is read defensively: a clear success is `sent`, a clear failure is
  `failed`, anything else is `unconfirmed` (shown to staff, **not** retried, to avoid sending twice). Send us a real reply and
  the rules in `interpretResponse` can be made exact.
- `failed` messages are retried by the scheduled job (`/api/cron/reminders`), up to 3 attempts within 24 hours. Staff can also
  press "Send again" in the log.

## Tournament messages (what triggers them)
- **`tournament_registered`**: a player registers (also "Waitlist number N" when full); staff add a member by username; a team
  becomes complete (every accepted member gets one). Walk-ins added by name have no number and get nothing.
- **`tournament_waitlist_moved_up`**: a withdrawal, a disqualification, a larger tournament size, or reopening registration
  gives a waiting player a place; staff promote someone by hand; a reshuffle replaces a no-show from the waitlist (sent only
  after the new bracket is saved).
- Each message is sent at most once per person per entry (`dedupe_key`), and a failure never stops the sign-up.
