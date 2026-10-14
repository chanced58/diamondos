# Tournament Feature Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox syntax. Delegate only if subsequently authorized.

**Goal:** Let tournament-enabled users create a tournament using an administered team or a new tournament team, and enforce its chosen batting-order rules.

**Architecture:** Add tournament instances alongside existing leagues, link games to registered tournament teams/seasons, and reuse the scoring engine with game-specific settings. Create instances atomically through an authenticated RPC; represent contraction through append-only substitution events.

**Tech Stack:** pnpm/Turborepo, TypeScript/Zod/Jest, Next.js, Supabase/Postgres, Expo/WatermelonDB.

**Spec:** [Proposed design](../specs/2026-10-13-tournament-design.md). Implementation was authorized and completed; [verification status](../../tournament-verification.md) records the remaining acceptance checks.

## Global constraints

- Never UPDATE or DELETE `game_events`.
- Change schema only through timestamped migrations and regenerate `packages/database/src/types/supabase.ts`.
- Tournament rules must not change an existing team's regular league rules.
- Creation requires an explicit tournament mode grant and eligible active team administration.
- New tournament defaults: expanded lineup No, mid-game expansion/contraction No.
- Existing games retain their behavior; legacy settings gain contraction=false.
- Commit each discrete unit; run CodeRabbit after feature implementation.

## Review focus

- Profile self-escalation and forged team IDs must be rejected at the database boundary.
- Duplicate submissions and mid-transaction failures must not create orphan resources.
- One team's overlapping tournament/regular games must never share the wrong cached rules.
- Shrinking an order after completed plate appearances must preserve the next batter, undo, and historical statistics.
- Tournament-specific seasons must not leak results into regular league aggregates or reset pitch-rest compliance.

## Workspace and baseline

Worktree: `/Users/chance/diamondos/.worktrees/tournament`.
Branch: `feature/tournament`, rebased onto `origin/main` at `8c750c4`.

The original checkout has an untracked user-owned `AGENTS.md`; it was left untouched. Its supplied instructions apply to this worktree too.

`pnpm install --offline --frozen-lockfile --ignore-scripts` could not finish because the cache lacks `@typescript-eslint/eslint-plugin@7.18.0`. No lockfile changes occurred. Relevant tests run in the original checkout at the same base revision passed: three suites, 45 tests (`league-settings`, `league-scoring-settings`, `lineup-adjustment`). This is not a full worktree baseline.

- [x] Complete `pnpm install --frozen-lockfile` with package-registry access before implementation, then run `pnpm test` in this worktree and record any baseline failures.
- [x] Confirm team-centered versus multi-team organizer scope, administrator roles, and contraction policy from the proposed design.

## Task 1: Shared tournament contracts and rule validation

**Create:** `packages/shared/src/types/tournament.ts`, `packages/shared/src/validation/tournament.ts`, `packages/shared/src/validation/__tests__/tournament.test.ts`.
**Modify:** `packages/shared/src/types/league-scoring-settings.ts`, `packages/shared/src/validation/league-scoring-settings.ts`, `packages/shared/src/utils/league-settings.ts`, their existing tests, and `packages/shared/src/index.ts`.

**Interface:** `createTournamentSchema` accepts name/dates, `requestId`, a discriminated team selection (`existing` with `teamId`, or `new` with name/organization/stateCode), and the two lineup answers plus optional cap. Output `TournamentCreationResult = { tournamentId: string; teamId: string; seasonId: string }`. Add `allowMidGameContraction` with a legacy default of false. Keep tournament mid-game permission independent of the expanded-lineup flag.

- [x] Write failing tests for both team branches, missing names, invalid IDs/dates, reversed date ranges, nine-batter limits, caps 10/30 and rejected 9/31 for expanded orders. Include the four combinations of the two answers and legacy default preservation.
- [x] Run `pnpm --filter @baseball/shared test -- --runInBand tournament league-settings league-scoring-settings` and confirm the new cases fail before implementing.
- [x] Implement strict validation and explicit mapping: No expanded → cap 9; Yes → selected cap; mid-game answer → extension and contraction flags. Export contracts and helpers.
- [x] Repeat the targeted test command and `pnpm --filter @baseball/shared type-check`.
- [x] Commit `feat(tournament): add tournament contracts and lineup rules`.

## Task 2: Authorized, atomic tournament creation

**Create:** timestamped migration ending `_tournament_instances.sql`, `supabase/tests/tournament-creation.test.sql`, and `packages/database/src/queries/tournaments.ts`.
**Modify:** generated database types and `packages/database/src/queries/index.ts`.

**Interface:** RPC `create_tournament(p_input jsonb)` reads `auth.uid()`, validates input, and returns the three creation IDs. Queries expose the eligible-team list and authorized tournament reads. The RPC, not the browser, supplies creator IDs.

- [x] Write database tests for missing/revoked grants, inactive/foreign memberships, self-grant attempts, both branches, participant/game constraints, duplicate requests, and an injected channel-insert failure. Assert every resource count is unchanged after rollback.
- [x] Add the permission column, admin-only grant guard and audit table, tournament/participant tables, game association, and RLS. Validate scoring JSON against required fields/ranges in SQL; client Zod validation alone is insufficient.
- [x] Implement the transaction with request-ID uniqueness and retry handling, head-coach/AD eligibility, a tournament season inactive for selected existing teams and active for new tournament-only teams, and new-team membership/channel creation. Restrict direct writes and RPC privileges. Keep roster and league membership unchanged.
- [x] Run `supabase db reset`, `supabase test db`, and `pnpm --filter @baseball/database gen-types`; verify all RLS tests pass with actual authenticated roles.
- [x] Add query wrappers and run `pnpm --filter @baseball/database type-check`.
- [x] Commit `feat(tournament): create authorized tournament instances atomically`.

## Task 3: Permission administration and creation UI

**Create:** `apps/web/src/lib/tournament-access.ts`, `apps/web/src/app/(app)/tournaments/new/{page.tsx,actions.ts,CreateTournamentForm.tsx}`, `apps/web/src/app/(app)/tournaments/{page.tsx,[tournamentId]/page.tsx}`, and action/access tests under adjacent `__tests__` directories.
**Modify:** `apps/web/src/app/(app)/admin/users/{actions.ts,AllUsersClient.tsx,page.tsx}`, `apps/web/src/components/layout/Sidebar.tsx`, and `apps/web/src/app/(app)/layout.tsx`.

**Interface:** `getTournamentAccess` returns the grant and eligible active teams. `createTournamentAction` validates FormData with the shared schema and calls the authenticated RPC. An admin-only permission action grants/revokes the capability and refreshes views.

- [x] Write failing action tests for forged team IDs, revoked grants between page load and submit, grant self-escalation, both form branches, field errors, and an RPC failure preserving input. Check that all eligible teams are listed rather than only the active team.
- [x] Implement server-authorized permission administration and creation flow with the exact label **Create Tournament Team**, both explicit rule questions, cap input, review summary, idempotency key, and submission pending/error states.
- [x] Implement a tournament workspace showing team, rules, roster link, and Add Game entry point. Gate navigation and direct routes with the same authorization logic.
- [x] Run `pnpm --filter web test -- --runInBand tournament` and `pnpm --filter web type-check`. Manually check keyboard controls and both creation branches.
- [x] Commit `feat(tournament): add permission management and creation wizard`.

## Task 4: Game association, rules, and season isolation

**Create:** `apps/web/src/lib/game-scoring-settings.ts`, `packages/shared/src/utils/effective-game-settings.ts`, their adjacent tests, and a migration ending `_tournament_game_settings.sql`.
**Modify:** game query/type definitions; `apps/web/src/app/(app)/games/new/{actions.ts,page.tsx,AddGameForm.tsx}`; lineup and opponent-lineup pages/actions; lineup guest actions; score page; relevant game-start paths; `apps/web/src/lib/league-snapshot/{aggregate.ts,recompute.ts,season.ts}` as required by verified query behavior.

**Interface:** `getScoringSettingsForGame(db, gameId)` uses frozen started-game settings, otherwise tournament settings when linked, otherwise the existing league resolver. Tournament lookup failure returns an actionable error, never permissive defaults. Game creation validates the tournament participant and uses its dedicated season.

- [x] Write failing tests for the same team with two tournament rulesets and a regular game, unregistered team/season combinations, tournament loading errors, settings edits after start, regular-game compatibility, and league aggregate exclusion. Add pitch-rest tests across regular and tournament seasons in the existing availability/compliance test locations.
- [x] Implement and constrain game association, snapshot effective settings atomically at start, and switch every game-aware settings consumer to game resolution. Restrict settings mutation once a game starts.
- [x] Preserve the regular active season and verify regular league statistics exclude tournament games. Verify pitch-rest calculations span seasons; fix only queries demonstrated to be scoped incorrectly.
- [x] Run `supabase db reset`, `supabase test db`, regenerate types, and run shared/web tests for game settings, league snapshots, and pitcher availability.
- [x] Commit `feat(tournament): apply tournament rules to scheduled games`.

## Task 5: Deterministic lineup contraction and write enforcement

**Create:** `packages/shared/src/utils/active-batting-order.ts`, `packages/shared/src/utils/__tests__/active-batting-order.test.ts`, and a migration ending `_tournament_lineup_enforcement.sql` with database tests.
**Modify:** `packages/shared/src/types/game-event.ts`, `packages/shared/src/utils/game-state.ts` where replay context needs it, `apps/web/src/app/(app)/games/[gameId]/score/ScoringBoard.tsx`, scoring controls/feed, and lineup/event ingestion/projection paths discovered during implementation.

**Interface:** append `SubstitutionType.LINEUP_CONTRACTION = 'lineup_contraction'`. Its payload identifies side/team and the removed stable player/slot. A shared reducer takes initial ordered slots and effective ordered events and returns active slots plus next-batter identity; web/mobile must use this reducer instead of their separate modulo calculations.

- [x] Write replay tests that remove a slot before/after the next batter after more than one full rotation, expand then contract, reject the active batter/runner, undo/void either change, and preserve statistics. Exercise home and opponent identities. Add DB tests for disabled changes, cap violations, concurrent final-slot additions, and direct forged event inserts.
- [x] Implement stable order/cursor replay and between-plate-appearance guards under the agreed contraction policy. Never delete historical lineup/event facts. Rebuild projections from effective events after voids.
- [x] Add database authorization and per-game serialization for lineup-changing events. Permit only valid payloads consistent with the game's fixed settings and authoritative order; evaluate transaction ordering with offline ingestion.
- [x] Add web add/remove controls, precise disabled reasons, and descriptive play-feed entries.
- [x] Run shared replay/stat regression tests, web scoring tests, and `supabase test db` including concurrent-write cases.
- [x] Commit `feat(scoring): support tournament lineup contraction`.

## Task 6: Mobile game rules and offline replay

**Create:** `apps/mobile/src/lib/game-scoring-settings.ts` and tests for game settings caching/offline loading.
**Modify:** `apps/mobile/src/db/{schema.ts,index.ts,models/Game.ts}`, local migrations registered in `index.ts`, `apps/mobile/src/sync/sync-engine.ts`, `apps/mobile/app/(tabs)/games/[gameId]/score.tsx`, and scoring substitution controls.

**Interface:** `useGameScoringSettings(gameId)` exposes explicit loading/ready/error states and game-specific settings. Persist tournament ID and fixed rules/version in WatermelonDB and pull them before enabling offline scoring.

- [x] Write failing tests for two games on the same team with different cached rules, uncached offline tournament access, reconnect/retry idempotency, revoked creation access with existing game access, and contraction/void replay after reload.
- [x] Add versioned local schema migration and sync fields without dropping existing local events. Use the shared batting-order reducer and enforce the same caps/guards as web.
- [x] Block tournament scoring mutations until verified settings are available. Validate pending offline lineup events at server ingestion and surface rejected changes for correction without erasing their audit trail.
- [ ] Run configured mobile tests and `pnpm --filter mobile type-check`; smoke-test download → airplane mode → expand/contract → reload → reconnect on both supported mobile platforms.
- [x] Commit `feat(mobile): score tournament games with offline rules`.

## Task 7: Acceptance, documentation, and review

**Modify:** project `AGENTS.md` with accepted Tournament/TournamentTeam/TournamentMode definitions, and `docs/baseball-rules.md` with the agreed contraction behavior. Keep draft decisions out of the authoritative glossary until accepted.

- [ ] Exercise authorized/unauthorized users, existing/new teams, all four rules combinations, same-team regular/tournament games, failed creation retry, contraction/undo, stats isolation, and cross-season compliance end to end.
- [x] Run `pnpm test`, `pnpm type-check`, `pnpm lint`, and `pnpm build` after dependencies/database prerequisites are ready; record pre-existing failures separately.
- [ ] Run CodeRabbit using the installed/authenticated repository workflow, address actionable findings, and rerun affected checks. If unavailable, report the blocker instead of claiming review passed.
- [x] Commit `docs(tournament): document setup and scoring behavior` and prepare a Conventional Commits PR description with tests and remaining limitations. Open a PR when implementation is requested; retain branch discipline and do not merge without authorization.

## Completion audit — 2026-10-14

Checked tasks reflect implemented deliverables and completed verification, including follow-up fixes. Historical red/green details are recorded in the execution ledger; a checked test task does not imply every command listed was available during the initial implementation. Database verification used unchanged SQL copied into an isolated project because legacy migration versions collide. Mobile tests and type checks pass; the combined native smoke task remains open. Browser creation/access acceptance passes; scoring acceptance is automated, with full device end-to-end coverage still open. The user-owned original AGENTS.md was preserved; accepted domain definitions are maintained in docs/baseball-rules.md.

Draft PR: https://github.com/chanced58/diamondos/pull/215. Both CodeRabbit runs reported six findings each; the initial run completed, while the follow-up CLI run continued sending heartbeats after 15 minutes. Every reported finding has been addressed or checked against current behavior, with affected database checks passing. The review checkbox remains open until the follow-up process finishes.
