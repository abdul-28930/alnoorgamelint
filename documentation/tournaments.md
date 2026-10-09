# Tournaments

Staff create tournaments, players (or teams) register, staff generate the bracket, report results and the winner
moves on automatically. This page describes the rules and the data model; the screens and API arrive in later steps
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

## Status

1. **Foundation (this step)**: database, bracket and standings engine, tests.
2. Admin screens and API: create / edit, registrations, seeding, generate, report results, undo, walkovers.
3. Public pages and sign-up: tournament list and detail with bracket and standings, register / withdraw, teams and invitations, live registration count, view count.
4. Extras: notifications, TV mode, station scheduling, group stage + playoffs.
