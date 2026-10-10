# Tournaments

Staff create tournaments, players (or teams) register, staff generate the bracket, report results and the winner
moves on automatically. This page describes the rules and the data model; public pages arrive in a later step
(see "Status" at the bottom).

## Formats (first release)

| `tournament_type` | Format | Notes |
|---|---|---|
| `knockout` | Single elimination | Byes for uneven fields (top seeds get them), optional third-place match, best of 1/3/5/7 |
| `league` | Round robin | Everyone plays everyone once (or twice with a return leg), points table |

Later: double elimination, group stage + playoffs, Swiss. Adding one means a new generator in
`frontend/server/tournaments/engine.ts` plus a `tournament_type` value; the match table and result functions are format-agnostic.

### Rules

- **Entrants** are players, or teams when `team_size > 1`. Everything below works on entrant ids.
- **Seeding**: `random` (shuffled when the bracket is generated) or `manual` (staff order the list). Seed 1 and 2 can only meet in the final, 1-4 only in the semi-finals, and so on.
- **Byes**: a field of 6 is padded to 8, so seeds 1 and 2 skip round 1. A bye is stored as a match so the bracket still draws; its winner is already waiting in round 2.
- **Third place** (knockout, 4+ entrants): the two semi-final losers play for it.
- **Draws** exist only in leagues (a completed match with no winner). A knockout match always has a winner.
- **League points**: win 3, draw 1, loss 0. Ties are broken by head-to-head points among the tied entrants, then score difference, then scores for, then seed.
- **Best of N**: stored on the match; scores are optional (staff can just press Won / Lost).
- **Walkover**: a winner can be awarded a match without playing (no-show, disqualification); it is flagged on the match.

## Lifecycle

`draft` -> `open` (registration) -> `active` (bracket generated, matches being played) -> `completed`; `paused` can sit between them.

- The bracket can be regenerated (re-seeded) until the first match goes `live` or `completed`.
- A result can be undone while the matches it fed have not started; undoing the final reopens the tournament.
- When the last match finishes the tournament completes. Knockout: the champion is the final's winner. League: the API sets the champion from the standings.

## Data model (`sql/setup/08_tournaments.sql`)

- `tournaments`: the existing table plus `rules`, `starts_at`, `registration_closes_at`, `entry_fee`, `prize_pool`, `prize_details`, `team_size`, `best_of`, `third_place_match`, `double_round_robin`, `seeding`, `view_count`, `champion_entrant_id`, `started_at`, `completed_at`. `max_players` is the maximum number of entrants (players or teams).
- `tournament_entrants`: who is playing (`user_id` for a solo player, `team_id` for a team, neither for a walk-in), `seed`, `status` (`registered`, `waitlist`, `checked_in`, `withdrawn`, `disqualified`), `payment_status` (`NOT_REQUIRED`, `PENDING`, `PAID`; staff mark paid at the counter, there is no payment gateway).
- `tournament_teams`, `tournament_team_members`: teams with a captain; members are invited and accept; a player can be on one team per tournament.
- `tournament_matches`: round, position, both entrants, scores, winner, `status` (`pending` waiting for entrants, `ready`, `live`, `completed`, `bye`), and the links `next_match_id` / `next_slot` (winner) and `loser_next_match_id` / `loser_next_slot` (third place).
- `tournament_views`: one row per visitor per day, which drives `tournaments.view_count`.
- `tournament_overview` (view): every tournament with `registered_count` and `waitlist_count`.

The old `tournament_registrations` table is no longer used by the new flow.

## Database functions

All are executable by the server only. They raise short codes that the API turns into messages.

| Function | Does | Error codes |
|---|---|---|
| `save_bracket(tournament, matches, seeds)` | Replaces the matches with a generated bracket, stores seeds, starts the tournament | `TOURNAMENT_NOT_FOUND`, `TOURNAMENT_COMPLETED`, `ALREADY_STARTED`, `NO_MATCHES`, `INVALID_ENTRANT` |
| `report_match_result(match, score1, score2, winner, walkover)` | Records the result, moves the winner (and the third-place loser) on, completes the tournament after the last match | `MATCH_NOT_FOUND`, `NOT_ACTIVE`, `BYE_MATCH`, `ALREADY_COMPLETED`, `MATCH_NOT_READY`, `INVALID_SCORE`, `INVALID_WINNER`, `SCORE_MISMATCH`, `DRAW_NOT_ALLOWED`, `WINNER_REQUIRED` |
| `undo_match_result(match)` | Takes a result back and removes the entrants it advanced | `MATCH_NOT_FOUND`, `NOT_ACTIVE`, `BYE_MATCH`, `NOT_COMPLETED`, `NEXT_MATCH_STARTED` |
| `record_tournament_view(tournament, visitor)` | Counts a visitor once per day (IST), returns the total | `INVALID_VISITOR`, `TOURNAMENT_NOT_FOUND` |

## Admin API (`/api/v1/admin`)

| Method and path | Who | Does |
|---|---|---|
| `GET /tournaments`, `GET /tournaments/{id}` | staff, admin | List with live counts; full detail (entrants, matches, standings, champion) |
| `POST /tournaments`, `PUT`, `DELETE /tournaments/{id}` | admin | Create, edit (structural settings lock once the bracket exists), delete (only before the bracket) |
| `PUT /tournaments/{id}/status?status=` | admin | `draft -> open <-> paused -> active`; completion is automatic |
| `POST /tournaments/{id}/entrants` | staff, admin | Add a walk-in or a user by username; over capacity goes to the waitlist |
| `PUT`, `DELETE /tournaments/{id}/entrants/{entrantId}` | staff, admin | Check in, mark paid, withdraw, disqualify, re-seed. Leaving promotes the waitlist (before start) or awards walkovers (after) |
| `POST /tournaments/{id}/bracket/preview`, `POST .../bracket` | admin | Preview or generate the bracket, optionally with a manual `order` |
| `PUT /tournament-matches/{id}` | staff, admin | Go live, schedule, station, notes |
| `PUT`, `DELETE /tournament-matches/{id}/result` | staff, admin | Report (won / lost, scores, draw in leagues, walkover) or undo |

Screens: `/admin/tournaments` (list, create, live counts) and `/admin/tournaments/{id}` (entrants, seeding, preview,
bracket or table with Won / Lost / no-show buttons, undo, champion banner). The page refreshes every 8 seconds.

## Public API (`/api/v1/tournaments`)

| Method and path | Auth | Does |
|---|---|---|
| `GET /tournaments` | none | Every non-draft tournament with live `registered_count`, `waitlist_count`, `view_count` (cached 5 s) |
| `GET /tournaments/{id}` | optional | Detail: entrants (names only, no user ids or payments), bracket or table, champion. With a token it adds `me` (your entry, teams, invitations) |
| `POST /tournaments/{id}/view` | none | `{visitor_id}`: counts one view per visitor per day (IST), returns the total |
| `POST`, `DELETE /tournaments/{id}/register` | user | Sign up (waitlist when full) or withdraw. Solo tournaments only; withdrawal only before the bracket exists |
| `POST /tournaments/{id}/teams` | user | `{name, usernames[]}`: the caller becomes captain and the others are invited |
| `POST /tournaments/{id}/teams/{teamId}/invite` | captain | `{username}` |
| `POST /tournaments/{id}/teams/{teamId}/accept` | invitee | Joins the team |
| `DELETE /tournaments/{id}/teams/{teamId}` | member | Decline or leave; the captain leaving disbands the team |
| `GET /tournaments/invitations` | user | Pending invitations for open tournaments |

A team takes a place (and goes to the waitlist when full) only once all `team_size` players have accepted. A member leaving
removes the team's place. Registration must be `open`, before `registration_closes_at`, and before the bracket exists.
Entry fees are shown only; staff mark entrants paid in the admin screen.

Pages: `/tournaments` (list with live counts and your invitations) and `/tournaments/{id}` (sign-up, team management,
rules and prizes, live bracket or table). Both refresh every 8-10 seconds.

## Poster, banner and sharing

Run `sql/setup/09_tournament_images.sql` (adds `poster_image`, a public `tournament-images` storage bucket, and rebuilds the
`tournament_overview` view). Admins upload from the create form or the tournament's "Poster and banner" panel
(`POST`/`DELETE /api/v1/admin/tournaments/{id}/image?kind=banner|poster`). The browser shrinks the picture first; the server
accepts JPEG, PNG or WebP up to 4 MB (checked by file content) and replaces the old file.

Every public tournament page has Share / Copy link / WhatsApp buttons, and the page sets Open Graph tags (title, summary,
banner or poster) so a shared link shows a preview. Set `NEXT_PUBLIC_SITE_URL` (for example `https://neogamingcafe.vercel.app`)
so the preview image links are absolute on every deployment.

## Status

1. **Foundation**: database, bracket and standings engine, tests. Done.
2. **Admin screens and API**. Done.
3. **Public pages and sign-up**: this step. Done.
4. Extras: notifications, TV mode, station scheduling, group stage + playoffs.
