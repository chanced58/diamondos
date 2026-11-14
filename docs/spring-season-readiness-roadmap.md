# Spring Season Readiness Roadmap

Audit date: 2026-11-14. First game: about April 2027. Scope: league, team, scorekeeping, public
pages, stats, messaging, scheduling and operations. The player recruiting profile (PlayerPro) was
out of scope.

The audit read the code; it did not run the apps on a device. Items marked **(verify)** rest on
behavior outside the repo (a library, a dashboard setting) and need a check before work starts.
Each phase gets its own spec and plan before implementation.

## Context

- Production web is hosted on **Render**. `apps/web/vercel.json` is not used, so the cron it
  declares never fires.
- Production Supabase is `diamondos-prod`, the only environment.
- The spring league **schedules its own games** (`leagues.schedules_games`).
- All scorekeeping is on **iOS**. An Android app and offline web scoring are out of scope.
- Repo health on the audit date: `pnpm type-check`, `pnpm lint` and `pnpm test` pass (shared 983
  tests, web 1,226, mobile 980).

## Checked in production (read-only, 2026-11-14)

- `game_events` has no webhook trigger; `pg_cron`, `pg_net` and the `supabase_functions` schema
  are not installed.
- `pitch_counts` has **0 rows** against 4,005 `pitch_thrown` events, and `catcher_innings` has 0
  rows. Pitch-count compliance, rest days, 7-day totals, compliance alerts and the Catcher tab
  have never run in production.
- Not checked: Render cron jobs and env vars, deployed `verify_jwt` settings on edge functions,
  the production JWT expiry, EAS environment and APNs credentials, the Supabase backup tier.

## Decisions

| Topic | Decision |
|---|---|
| Phase order | Approved as below |
| Player–adult direct messages | Allowed with oversight: the player's linked parents and the head coach can read them, and deleted messages are kept for review |
| Public game pages | Full schedule and final box scores are public with masked names (First L.); live play-by-play stays for signed-in members and parents |
| Error monitoring vendor | Open; decide in the Phase 1 spec |

## Phase 1 — Safety net

- **CI.** No `.github/` directory; nothing runs type-check, lint or tests on a PR. The Deno tests
  and `supabase/tests/database` SQL tests are run by nothing.
- **Error monitoring.** None on web, mobile or edge functions. Sync failures reach only
  `console.warn` (`apps/mobile/src/providers/SyncProvider.tsx:119`).
- **Error pages.** No `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` under
  `apps/web/src/app`; no error boundary in `apps/mobile`.
- **Scheduled and triggered jobs defined in code.**
  - League snapshot rebuild (`/api/cron/rebuild-league-snapshots`, needs `CRON_SECRET`) as a
    Render cron job.
  - `pitch-count-calculator` webhook on `game_events` (absent in production, see above).
  - `practice-notifications-dispatch` every 5 minutes.
- **Mobile release path.** No `expo-updates` (every fix needs a build and review); no
  minimum-app-version check; `/api/m/v1` has no version negotiation.
- **Environment variables.** `NEXT_PUBLIC_APP_URL` unset sends invite links to a
  `*.vercel.app` domain (`apps/web/src/app/(app)/admin/create-team/actions.ts:78` and three
  others). `NEXT_PUBLIC_APP_URL`, `ICS_FEED_BASE_URL`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY` and
  `ICS_FEED_SECRET` are missing from `.env.example` or the CLAUDE.md table.
- **Housekeeping.** CLAUDE.md says tests are not configured, 12 migrations and Vercel hosting;
  all three are stale. `supabase/all_migrations.sql` and `supabase/fix_rls_policies.sql` are
  stale and risky to run. Middleware's protected-route list is out of date
  (`apps/web/src/middleware.ts:49-54`; the `(app)` layout still redirects).

## Phase 2 — Game-night data integrity

- **Offline scoring past token expiry (verify on a device).** `recordEvent` throws when
  `getSession()` returns null (`apps/mobile/src/features/scoring/use-record-event.ts:33-35`); an
  expired token cannot refresh offline, and `PitchInput.tsx:457` does not surface the error.
- **Unpaged sync pull.** `game_events` is pulled in one query
  (`apps/mobile/src/sync/sync-engine.ts:854`), capped at 1,000 rows; a new or reinstalled phone
  keeps partial logs.
- **Reset game ignored by phones.** `use-game-state.ts` and `deriveGameState` do not filter
  `game_reset`; `reconcileGameLifecycle` can then finalize the game 0–0.
- **Caught stealing resets the count** (`packages/shared/src/utils/game-state.ts:444-445`),
  forcing phantom pitches on mobile.
- **Final score vs live scoreboard.** `computeLineScore` has no catcher's-interference branch
  (`packages/shared/src/utils/line-score.ts`), and the server's final score comes from it.
- **Web Undo** reverts to before the last pitch and drops later outs, substitutions and steals
  (`ScoringBoard.tsx:1883-1897`).
- **Two devices on one game** merge into one log with duplicated plays; nothing warns.
- **Game ended offline** finalizes only when the app is next open with signal; the "Not
  finalized" banner looks unreachable (`score.tsx:2058`) **(verify)**.
- **Smaller:** unpaged single-game event reads in `finalize.ts:83-87` and `score/page.tsx`; one
  permanently refused event blocks all event pushes (`sync-engine.ts:1215-1220`); no recovery
  from an accidental End Game on mobile; no keep-awake while scoring; loose `game_events` insert
  policy (no `created_by` check).
- **Tests to add:** reducer cases for caught stealing, sacrifices, double plays, balks, rundowns,
  forced walks; a line-score test file.

## Phase 3 — Stat correctness

- **Innings pitched** skips outs on the bases: `baserunner_out`, `caught_stealing`, pickoff and
  rundown outs, and triple plays (`packages/shared/src/utils/pitching-stats.ts:789-833`).
- **Runs and earned runs undercounted** when opponent batters walk, are hit, or reach on
  catcher's interference in mobile-scored games (reads only `payload.batterId`,
  `pitching-stats.ts:636, 668, 676`).
- **Pitches to untracked opponent batters dropped** (`pitching-stats.ts:389`).
- **No RBI on a run-scoring out** (`packages/shared/src/utils/batting-stats.ts:479-530`).
- **Inherited runners and reached-on-error runs** charged to the wrong pitcher or counted earned.
- **Rest status always "Eligible".** Nothing writes `pitch_counts.required_rest_days` or
  `can_pitch_next_day`; null reads as eligible (`season-stat-columns.ts:305`).
- **Pitch-count ruleset is arbitrary.** The Bullpen Planner takes `limit(1)` over system rules
  (`packages/database/src/queries/pitcher-availability.ts:56-62`); a standalone team cannot set
  one; the league's chosen ruleset is not read. The planner's empty state points to a page that
  does not exist.
- **`pitch_counts` ignores undo, void and reset**, and needs a backfill once the webhook exists.
- **Catcher tab empty.** `recompute_catcher_innings_for_game` is never called.
- **Career stats query** selects columns `game_events` does not have
  (`packages/database/src/queries/player-profiles.ts:375-407`).
- **Missing stats:** stolen bases and caught stealing, fielding on a stats page, wins/losses/saves,
  a scrimmage or game-type flag.
- **MaxPreps export** lacks the reset filter and third-out guard of the shared reducer, and is
  batting only.

## Phase 4 — Access and safety

- **`push-notifications` has no caller check** (`supabase/functions/push-notifications/index.ts`);
  the same for `practice-notifications-dispatch` and `pitch-count-calculator` **(verify deployed
  `verify_jwt`)**.
- **Removed members keep access.** `removeMember` does not delete `channel_members` or
  `parent_player_links`; messages RLS checks only `channel_members`; `can_rsvp_for_player` still
  passes; deactivating a player leaves their and their parents' memberships active.
- **Posting-rights loophole.** `users_update_own_channel_membership` lets a member set
  `can_post = true`; `users_update_own_messages` lets a sender move or re-date a message.
- **Role changes** do not update `can_post`.
- **Invitations accepted early.** `healPendingInvitations`
  (`apps/web/src/app/(app)/teams/[teamId]/roster/page.tsx:41-151`) and
  `healMissingTeamMembership` promote pending invitations before the invitee clicks, so
  `processInvite` skips linking children and claiming the player. Mobile `auth-callback` never
  runs `processInvite`.
- **Mobile sign-up bypass.** `sign-in.tsx:67-72` calls `signInWithOtp` without
  `shouldCreateUser: false`.
- **Direct messages:** implement the oversight decision above.
- **Player of the Week** shows a full last name to signed-out visitors
  (`apps/web/src/lib/league-snapshot/aggregate.ts:222`).
- **"Signed in" privacy tier** is any account, including self-sign-ups, with no league
  relationship (`app/l/[slug]/page.tsx:53`).
- **League managers** can change `schedules_games`, `current_season` and `league_members` through
  RLS though the services restrict these to admins.
- **Account deletion** fails on about 20 unhandled foreign keys and updates `game_events`; there is
  no self-service deletion (App Store requirement).
- **Web basics:** no rate limiting on `/api/leads`, `/api/auth/send-magic-link`,
  `/api/auth/player-signup`; `send-magic-link` reveals whether an email is registered; no CSP or
  HSTS headers; no privacy policy or terms page found.
- **Tests to add:** RLS tests for `channels`, `channel_members`, `messages`, `game_rsvps`.

## Phase 5 — Notifications and messaging

- **No push or email for messages, announcements or schedule changes.** `sendPush` has one
  caller (`apps/web/src/lib/league-games/refresh.ts:289`). `updateGame` announces nothing at all.
- **Web thread loads the oldest 50 messages** (`messages/[channelId]/page.tsx:75-76`), no paging;
  mobile shows the latest 100 with no older-message loading.
- **Unread state.** `last_read_at` is written and never read: no badges or dots.
- **Push tokens.** Expo tickets and receipts are never read, so dead tokens are never pruned; a
  shared phone can keep the previous user's token (`apps/mobile/src/lib/notifications.ts:73-81`).
- **Mobile send queue** queues RLS refusals as "will send when you reconnect" and can duplicate
  after a timeout (`messages/[channelId].tsx:76-102`).
- **"Notify team" alerts** vanish when a team has two announcement channels
  (`messages/notify.ts:19`).
- **Channel self-heal** only repairs users in zero channels.
- **Pre-practice push** goes out for cancelled practices and never to parents.
- **Gaps:** notification preferences and muting, game-day and RSVP reminders, attachments, web
  Realtime for deletes, email fallback for web-only users.

## Phase 6 — League season operations

- **Season rollover.** `leagues.current_season` is written only by the setup wizard
  (`league/setup/actions.ts:75`); league games and public pages stay on the old season. Seasons
  sort alphabetically.
- **Two standings calculations.** The signed-in League page
  (`lib/services/league/load-league-page.ts`) ignores season, tournaments and `schedules_games`,
  shows forfeits as ties, double-counts games and truncates at 1,000 rows; the public page uses
  the snapshot.
- **Hand-entered results blocked** once either book has any event, reset markers included
  (`manual-result.ts:148-154`, `refresh.ts:185`): a rainout after one inning is stuck.
- **Snapshot not rebuilt** after division moves, team deactivate or remove, the `schedules_games`
  switch, transfers and releases; removing a team leaves its future games scheduled. The snapshot
  replace is delete-then-insert without a transaction (`league-snapshot/write.ts:41-62`).
- **Setup wizard** cannot be retried after a mid-way failure.
- **League game management:** one game at a time, web only; no bulk entry, import or generator
  (the `20260801000004` schedule tables have no app code); a cancelled game cannot be reinstated;
  no playoffs; tiebreaker is win% then name.
- **Smaller:** manual batting lines need the player on that team today; no manual pitching lines;
  placeholder match is irreversible; `cancelLeagueGame` cancels mid-scoring.

## Phase 7 — Scheduling

- **Practices and team events render in the server's zone on the web** (no zone column; a 6 PM
  practice reads 11 PM): calendar, dashboard, practice list and detail, event detail.
- **No postpone or reschedule.** `postponed` exists in the enum but nothing sets it; practices
  and events cannot be moved.
- **Cancelled practices** appear live on the mobile calendar
  (`ScheduleCalendar.tsx:286-292`) and in the calendar feed.
- **Calendar feed** (`team-calendar-ics`) needs `verify_jwt = false` to work for calendar apps
  **(verify)**.
- **Season assignment** uses the active season, not the game's date (`create-game.ts:68-74`).
- **Facility bookings** save an hour off across the March DST change
  (`schedule/NewBookingForm.tsx:11-18`) and show Sat–Fri weeks.
- **Gaps:** recurring practices and events, RSVP for practices and events, game type
  (scrimmage, non-league), conflict detection across games and practices.
- **Smaller:** the dashboard's next game drops off at its scheduled minute; the mobile Games list
  mixes all seasons oldest first; RSVP load failures are swallowed.

## Phase 8 — Public and fan pages

- **Public schedule and final box scores** per the decision above; in-progress games currently
  vanish from the league home until finalized.
- **Recent Results** ignores the selected season.
- **Home page player snapshot read** is unpaged (`league-home/load.ts:384`).
- **Sitemap, robots, branded 404**, and an unknown `?season=` rendering an empty page.
- **Private league name** shown on the blocked page.
- **Marketing "Start free"** leads to player sign-up; a coach or league has no obvious path.

## Phase 9 — Later

- Team roster CSV import and season carry-over.
- Season stat CSV export; caching for the Stats and roster pages (both replay the whole season
  per view).
- Billing automation (tiers are rows a platform admin inserts; trial end dates are never read).
- Message attachments.
- Coach onboarding guide and a game-night runbook; a documented backup and restore procedure.
- Stale `invite-member` and `create-team` edge functions.

## Lower priority: leagues that do not schedule their own games

These do not affect the spring league.

- Trades and releases move or remove past stats (`league-snapshot/recompute.ts:130`).
- Mirror games drift after an edit or cancel.
- "Upcoming" on the public page lists stale unplayed games (`league-home/load.ts:460-467`); the
  games counter undercounts.
