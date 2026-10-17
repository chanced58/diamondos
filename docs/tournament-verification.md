# Tournament implementation verification

Branch: `feature/tournament`; worktree: `.worktrees/tournament`.
Verified on 2026-10-14. Production migrations deployed 2026-10-15 (see [Production deployment](#production-deployment--2026-10-15)).

## Implemented

- Platform-admin grant/revocation with audit records; authenticated creation checks and team eligibility (active head coach or athletic director).
- Existing administered team or **Create Tournament Team**, with atomic creation, request-ID retries, dedicated seasons, roster access and game scheduling.
- Independent expanded-order and mid-game-change answers, defaults No, cap 9 or 10–30, and live review summary.
- Per-game frozen rules, regular-season/stat isolation and cross-season pitch-rest checks.
- Stable lineup expansion/contraction replay on both sides, undo/stat preservation and database authorization, caps and concurrent-write enforcement.
- Mobile game-scoped offline rules, starting-lineup upload ordering, durable rejection details and explicit cancellation through append-only audit events. Other games continue syncing when one game's lineup change is rejected.

This is a team-centered first release. Contraction removes an occupied slot between plate appearances, preserves remaining order and prior statistics, adds no automatic out, and cannot remove the scheduled batter, a baserunner or the last batter. Brackets and multi-team registration are future work.

## Passing verification

- `pnpm test -- --concurrency=1`: 105 suites, **1,102 tests** (shared 705, web 85, mobile 312).
- `pnpm type-check`, `pnpm lint` and `pnpm build`: passed. Lint retains existing warnings.
- Four real PostgreSQL pgTAP suites: **66 assertions** passed, covering authorization, rollback/idempotency, settings, start and lineup enforcement.
- Two-connection concurrency tests: the lineup writer waited, received a serialization conflict, and its retry was rejected at the cap without changing scores. Concurrent identical creation requests waited and returned the same tournament.
- Local browser acceptance: both team choices, all four rules combinations, keyboard interaction, review summary, revocation after page load, input retention, existing-instance access and tournament game scheduling.
- Initial CodeRabbit review: all six findings addressed (navigation, initial-slot replay, mobile refill cap, rejected queues, start upload ordering and forced runner advancement). The follow-up review found three further defects (same-key creation serialization, canceled-slot numbering and plain start ingestion), now fixed and verified, plus a weak fixture assertion, now corrected. Two compatibility questions were checked against existing paths: the league form submits normalized settings including contraction=false; tournament lineup sync skips started games and regular substitutions remain events, so no mutable replacement projection needs an exception. The follow-up CLI completed with ten findings. Its four final mobile findings were fixed: message starvation, addition locking, persisted rejection recovery and the active opponent picker. Regression tests and final JS/type/lint checks pass. No finding-free rerun is claimed. The subsequent GitHub review posted six inline findings; all six were fixed, replied to with commit/test evidence, and resolved. A focused CLI follow-up found a malformed-cancellation-ID edge case; its regression now passes, and the final two-file CLI review completed with zero findings.

## Remaining acceptance and deployment prerequisites

Physical iOS lineup-extension acceptance passed on 2026-10-16 (see [iPad acceptance](#ipad-acceptance--2026-10-16)). Airplane-mode → lineup changes → reload → reconnect on iOS, and all Android device checks, remain pending. Automated cache, queue, transport and replay tests passed; these do not replace native device acceptance.

Normal local Supabase startup is blocked by two pre-existing migrations sharing `20260523000001`. Deployed history was preserved. The isolated test harness copies every SQL file unchanged and adjusts only local version labels. Resolve the historical version collision against the target environment's migration history before deployment.

## Reproduce database checks

With Docker and Supabase CLI available, choose an empty disposable directory:

```sh
node supabase/tests/prepare-isolated-database.mjs /tmp/diamondos-tournament-tests
supabase start --workdir /tmp/diamondos-tournament-tests
supabase test db --workdir /tmp/diamondos-tournament-tests
```

The concurrency script commits disposable fixtures and must run only against that test database. Run `node supabase/tests/tournament-concurrency.mjs` with Docker pointing at the local test stack. Reset the isolated database before repeating fixtures. Database types were generated from the applied schema; tournament table/RPC contracts were merged while preserving unrelated existing schema metadata.

The original untracked, user-owned `AGENTS.md` was preserved. Accepted tournament definitions and scoring policy are documented in `docs/baseball-rules.md`.

## PR comment follow-up — 2026-10-14

Commits `9e10575` and `31fe3d9` address all six GitHub review threads:

- Scope rejection restoration to tournament games; recover malformed cached diagnostics with visible logging.
- Share historical-slot calculation across web/mobile, isolate sides, exclude canceled attempts, and preserve accepted history across resets and normal undo. The web page supplies the complete event history; scoring replay remains scoped to the current session.
- Label both lineup selects for screen readers.
- Restrict membership RPC execution and prevent authenticated callers querying another user's membership.
- Clear a linked advancing runner from every base before placing them or recording that they scored.

Regression tests reproduced the cache/history and SQL failures before the fixes. The final cancellation-ID guard also distinguishes absent IDs from string IDs, including for optional-ID inputs.

## Production deployment — 2026-10-15

The six tournament migrations were applied to `diamondos-prod` through the Supabase MCP `apply_migration` tool, one transaction per file, in filename order. Each recorded version was then reset to its repository timestamp (`20261013000001`–`20261014000002`). Do not use `supabase db push` against prod: most historical prod versions were recorded under apply-time timestamps rather than repository filenames.

- Pre-flight: no tournament objects existed; every referenced function, column, enum value and unique key was present; no file uses `CONCURRENTLY` or enum additions.
- The `20260523000001` version collision is local-only. Prod recorded those two files as `20260523142822` and `20260523201608`, so it did not block deployment.
- Verification: all 16 deployed function bodies match the repository byte-for-byte (`md5(prosrc)`), along with the 3 RLS-enabled tables, 3 policies, 10 triggers, 6 constraints and the RPC `EXECUTE` grants. All 29 existing games remain non-tournament.
- Advisors: no blocking findings. The trigger functions are reported as RPC-callable, but Postgres rejects direct calls to trigger functions. Explicit `REVOKE`s remain a hygiene follow-up, along with `(select auth.uid())` in the two read policies.
- Not deployed by this change: `20260420000001`, `20260730000001` and `20260801000001`–`04` are still missing from prod and are tracked separately.

## iPad acceptance — 2026-10-16

A signed Release build of this branch ran on an iPad mini (A17 Pro, iPadOS 26.5, landscape) against prod. It scored a SHAKEDOWN tournament game (11-batter cap, mid-game changes on) through an XCUITest that drove the real UI. The test lived in a local UI-test target in the generated `ios/` project and was not committed. Both teams started with 10 batters and added an 11th during the second time through the order:

- **Opponent:** a new player was created in-app right after Away02's second plate appearance. Away03 was still due, and Away11 batted after Away10 in each later trip.
- **Us:** Home11 (on the roster) was added right after Home10 finished the second trip. Home11 batted next, before Home01.
- **Event log:** 342 events, no sequence gaps, two `lineup_extension` substitutions (slot 11 each), no voids or rejections. The server projected both slot-11 lineup rows as non-starters. Every plate appearance recorded a batter. The opponent's sequence was 1–10, 1–10, 11, 1–10, 11, 1–7 and ours 1–10, 1–10, 11, 1–10, 11, 1.
- **Stats:** replaying the log through the shared reducers credits 11 batters and 33 PAs on our side. Home11 had 2 PA (1 BB, 1 K), and pitch counts match the pitches thrown.
- **Found during the run:** in landscape the Add Batter sheet sits fully behind the keyboard once a field is focused, so the coach must dismiss the keyboard to reach the other fields and "Add to order". This is being fixed separately.

The game and every row it created were deleted from prod afterwards, and the tournament-mode grant was revoked. Both the grant and the revoke are in `tournament_mode_permission_audit`.

## Open creation to all coaches — 2026-10-16

No user in prod held the tournament mode grant after the iPad acceptance revoke, so nobody could see **New Tournament**. Product decision: drop the grant. `20261016000001_open_tournament_creation_to_coaches.sql` replaces `create_tournament` without the `tournament_mode_enabled` check; the existing-team branch still requires an active head coach / athletic director membership, and the new-team branch is open to any signed-in user, matching regular team creation. The web app no longer reads the flag (tournaments list, New Tournament page, server action, sidebar) and the Admin → Users grant toggle is removed. The column, `set_tournament_mode_permission` and `tournament_mode_permission_audit` stay as history.

The form now labels the choices **Use my existing team** (tournament season on the current roster; regular-season stats stay separate) and **Create Tournament Team** (a separate team with its own roster, schedule and stats).

Deployed to `diamondos-prod` on 2026-10-16 via MCP `apply_migration`. The recorded version was reset to `20261016000001`. Pre-flight: the deployed `create_tournament` body matched the repository (`md5(prosrc)` `d25e1f3b…`). After the change it is `2dd7bf7e…`, matching the new migration. Smoke test as a real head coach with no grant, in a block that always rolls back: a separate tournament team was created, the coach's own team was attached, a team they don't coach was denied (`42501`), and a missing end date was rejected (`22023`). Afterwards there were 0 tournaments and no smoke rows. The pgTAP suite was updated but not run (no local Docker).

## Platform-admin creation fix — 2026-10-16

After #221 deployed, **Create Tournament Team** failed for a platform-admin account. `create_tournament` inserted the creator as head coach, and `prevent_platform_admin_team_membership` rejects any `team_members` row for a platform admin ("Platform administrators cannot be members of a team"), which rolled back the whole creation. `20261016000002_tournament_creation_platform_admin.sql` mirrors the `create-team` edge function: platform admins get no `team_members` / `channel_members` rows and reach the team through `is_platform_admin()`. Coaches are unaffected.

Deployed to `diamondos-prod` on 2026-10-16 via MCP `apply_migration`, and the version was reset to `20261016000002`. The deployed body matched the repository before (`2dd7bf7e…`) and after (`ce850a25…`). The failure was reproduced first as the platform-admin account in a block that always rolls back. After the fix, the same block showed:

- The admin created a separate team and can read the tournament. No `team_members` / `channel_members` rows were written for the admin.
- A head coach still gets their head-coach row on a new team, and can still attach their existing team.

Afterwards there were 0 tournaments and no smoke rows. The new pgTAP cases were not run locally (no Docker).

## Creator head-coach seat and mobile tournament path — 2026-10-16

After the previous fix, the platform-admin creator of **Arizona 40+ 2026** (team Idaho Natives) could not schedule. The Add Game page admits platform admins via `getUserAccess`, but `createGameAction` checks `team_members` only. The same seat-only checks exist in web lineups, opponents and guests, `game_events` / opponent-lineup RLS, the tournament lineup guards and the mobile team list, so an admin creator could not score either.

`20261016000003_tournament_creator_head_coach.sql`:

- Lets a platform admin hold a seat on a tournament-only team registered to a tournament they created.
- Seats every creator as head coach and Announcements poster. The seat is inserted after `tournament_teams`, so the exception can see it.
- Backfills existing tournament-only teams.

Promoting a user to platform admin keeps those seats.

The mobile app had no team switcher, so a second team's games were unreachable. The Games and Schedule tabs now show a `TeamSwitcher` for users on two or more teams, with tournament-only teams tagged **Tournament**. Tournament games carry the same tag in both lists. There is no WatermelonDB schema change.

Deployed to `diamondos-prod` on 2026-10-16 via MCP `apply_migration`, and the version was reset to `20261016000003`. Pre-flight:

- `create_tournament` matched `20261016000002` (`ce850a25…`) and the platform-admin trigger matched its original.
- The backfill had exactly one target, Idaho Natives.

Afterwards the deployed body matched the repository (`b3243950…`), and the creator account was an active `head_coach` and Announcements poster on Idaho Natives. In a block that always rolls back, that account, authenticated through RLS, completed four steps:

1. Scheduled an Arizona 40+ 2026 game.
2. Saved a 9-batter lineup.
3. Started the game through `start_tournament_game_for_user`, with rules frozen and status `in_progress`.
4. Recorded a `pitch_thrown` event.

The same account was still refused a seat on a regular team. No smoke rows remained afterwards.

## Draft status removed — 2026-10-17

New tournaments were created as `draft`, and nothing ever moved them out of it, so every tournament showed as a draft. Status is display-only: no function, policy or trigger reads `tournaments.status`. `20261017000001_remove_tournament_draft_status.sql` does three things:

- Moves existing drafts to `active`.
- Defaults new rows to `active`.
- Limits the check constraint to `active / completed / archived`.

`create_tournament` never set a status, so it needed no change.

Deployed to `diamondos-prod` on 2026-10-17 via MCP `apply_migration`, and the version was reset to `20261017000001`.

- Arizona 40+ 2026 is now `active`, and no drafts remain.
- The default is `'active'` and the check constraint allows only `active / completed / archived`.
- A rolled-back `create_tournament` call returned an `active` tournament.
