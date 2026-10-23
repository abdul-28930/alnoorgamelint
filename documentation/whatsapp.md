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

## Staff buttons (tournament page)
- **Send WhatsApp notification** (admin): pick the group (everyone registered, checked in, waitlist, no-shows, or the players
  still to play in a round), see how many will get it, write one line (200 characters), and send. Uses `tournament_update`.
  Every person is prepared first, then sent in small batches while the page shows progress; a unique batch id means pressing
  the button twice cannot send twice, and the scheduled job finishes any messages left waiting by a closed tab after 3 minutes.
  Up to 300 people per send.
- **Call players on WhatsApp** (staff): on each ready or live match; messages both players with `match_call`. Pressing it
  again within 5 minutes sends nothing new.
- Endpoints: `GET /api/v1/admin/tournaments/{id}/notify/preview`, `POST .../notify`, `POST .../notify/continue`,
  `POST /api/v1/admin/tournament-matches/{matchId}/call`.

## Booking messages
- **`booking_confirmed`**: sent to the customer right after a booking with a time is saved (station, date, start time, hours,
  amount, reference).
- **`reservation_received`**: sent instead when the booking has no time yet (a reservation staff will confirm).
- The reference is `NGC` plus the first 6 characters of the booking id (also used on the receipt message).
- One message per booking (`booking:<id>:created`); a failure never fails the booking. Walk-ins checked in by staff do not
  get one (the player is standing at the counter).

## Receipt on WhatsApp
- **Send receipt on WhatsApp** is in the booking menu (Admin > Bookings, for checked-in or ended sessions) and on Admin >
  Receipts. A small window asks for a number only if staff want to override the one on file.
- The server builds the receipt PDF, saves it in the **private** `receipts` storage bucket (run
  `sql/setup/14_receipts_bucket.sql`), and sends the customer a 7-day link to it as the document of the `receipt_ready`
  template (`Fileurl`, `PDFName`).
- The number is the member's profile number, a walk-in guest's number, or one typed by staff; staff see only the last 4 digits
  of where it went. Pressing the button again within 10 minutes sends nothing new (a later press sends a fresh receipt, useful
  after a payment changes).
- Old receipt files stay in the bucket (the links expire after 7 days); they can be deleted from the Supabase storage page.
