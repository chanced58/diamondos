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
