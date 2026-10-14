# Tournament implementation verification

Branch: `feature/tournament`; worktree: `.worktrees/tournament`.
Verified on 2026-10-14. Production migrations have not been deployed.

## Implemented

- Platform-admin grant/revocation with audit records; authenticated creation checks and team eligibility (active head coach or athletic director).
- Existing administered team or **Create Tournament Team**, with atomic creation, request-ID retries, dedicated seasons, roster access and game scheduling.
- Independent expanded-order and mid-game-change answers, defaults No, cap 9 or 10–30, and live review summary.
- Per-game frozen rules, regular-season/stat isolation and cross-season pitch-rest checks.
- Stable lineup expansion/contraction replay on both sides, undo/stat preservation and database authorization, caps and concurrent-write enforcement.
- Mobile game-scoped offline rules, starting-lineup upload ordering, durable rejection details and explicit cancellation through append-only audit events. Other games continue syncing when one game's lineup change is rejected.

This is a team-centered first release. Contraction removes an occupied slot between plate appearances, preserves remaining order and prior statistics, adds no automatic out, and cannot remove the scheduled batter, a baserunner or the last batter. Brackets and multi-team registration are future work.

## Passing verification

- `pnpm test -- --concurrency=1`: 103 suites, **1,091 tests** (shared 702, web 85, mobile 304).
- `pnpm type-check`, `pnpm lint` and `pnpm build`: passed. Lint retains existing warnings.
- Four real PostgreSQL pgTAP suites: **58 assertions** passed, covering authorization, rollback/idempotency, settings, start and lineup enforcement.
- Two-connection concurrency test: second writer waited, received a serialization conflict, and its retry was rejected at the cap without changing scores.
- Local browser acceptance: both team choices, all four rules combinations, keyboard interaction, review summary, revocation after page load, input retention, existing-instance access and tournament game scheduling.
- Initial CodeRabbit review: all six findings addressed (navigation, initial-slot replay, mobile refill cap, rejected queues, start upload ordering and forced runner advancement). Final review status is recorded in the PR.

## Remaining acceptance and deployment prerequisites

Physical/emulated iOS and Android airplane-mode → lineup changes → reload → reconnect smoke tests remain pending. No devices were connected or booted, and no native build artifacts were available. Automated cache, queue, transport and replay tests passed; these do not replace native device acceptance.

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
