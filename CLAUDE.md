# CLAUDE.md — Baseball Coaches App

This file provides guidance for AI assistants (Claude and others) working on this repository. Keep it up-to-date as the project evolves.

---

## Project Overview

**baseballcoachesapp** is a full-stack coaching platform for high school and youth baseball. It covers five pillars:

1. **Scorekeeping** — offline-first pitch-by-pitch event logging with real-time live score streaming for parents
2. **Communication** — tiered channels (announcement, topic, DM), push notifications, RSVP tracking
3. **Practices** — drill library, drag-and-drop practice builder, multimedia CDN *(v2)*
4. **Administration** — pitch count compliance (NFHS / Little League / NCAA rules), MaxPreps export, FERPA-compliant roster/user management
5. **Statistics** — event-sourced aggregation, Quality At-Bats, spray charts, scouting reports *(v2)*

---

## Repository Status

| Item | Status |
|------|--------|
| Initialized | Yes |
| Source code | Phase 1 complete — monorepo scaffold, packages, Supabase schema, web + mobile apps |
| Tests | `packages/shared/src/utils/` has solid Jest coverage (event-sourcing reducer, pitch count, stats). `apps/mobile` has no test setup yet — UI/hooks/sync are untested. |
| CI/CD | Not yet configured |
| Documentation | CLAUDE.md + inline code comments |

---

## Development Workflow

### Branching Strategy

- `main` (or `master`) — stable, production-ready code
- `dev` / `develop` — integration branch for features
- `feature/<short-description>` — individual feature work
- `fix/<short-description>` — bug fixes
- `claude/<task-description>-<session-id>` — AI-assisted work branches

Always branch off `main` (or the designated integration branch) and open a pull request to merge back.

### Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

[optional body]
[optional footer]
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`

Examples:
```
feat(roster): add player import from CSV
fix(stats): correct ERA calculation for partial innings
docs: add CLAUDE.md with project conventions
```

### Pull Requests

- Title should match the commit message style above
- Include a description of what changed and why
- Link to any relevant issues
- All CI checks must pass before merging

---

## Commands

### Install Dependencies
```bash
pnpm install
```

### Run Development Servers
```bash
# All apps in parallel (via Turborepo)
pnpm dev

# Web only (Next.js on http://localhost:3000)
pnpm dev:web

# Mobile only (Expo — starts Metro for the custom dev client, NOT Expo Go)
pnpm dev:mobile
```

> Mobile uses a custom **dev client**, not Expo Go — see [Mobile Development Workflow](#mobile-development-workflow) below before touching `apps/mobile`.

### Run Tests
```bash
pnpm test
```

### Build for Production
```bash
# Web (Next.js)
pnpm build

# Mobile iOS (via Expo EAS)
pnpm --filter mobile build:ios

# Mobile Android
pnpm --filter mobile build:android
```

### Lint / Format
```bash
pnpm lint
pnpm format          # write
pnpm format:check    # check only (CI)
```

### Type Check
```bash
pnpm type-check
```

### Supabase (local dev)
```bash
# Start local Supabase stack (requires Docker)
supabase start

# Apply all migrations
supabase db reset

# Regenerate TypeScript types from local DB
pnpm --filter @baseball/database gen-types

# Deploy edge functions
supabase functions deploy pitch-count-calculator
supabase functions deploy push-notifications
supabase functions deploy maxpreps-export
supabase functions deploy create-team
supabase functions deploy invite-member
```

---

## Mobile Development Workflow

`apps/mobile` depends on `@nozbe/watermelondb`, which requires native/JSI code. **Expo Go cannot run it.** The project uses a custom **Expo Dev Client** instead (`expo-dev-client` + `eas.json`). Do not suggest scanning the Expo Go QR code or `npx expo start` without `--dev-client` — that path silently breaks WatermelonDB and is the source of most "mystery" bugs that only show up during a live game test.

### One-time setup (per device / per native dependency change)

1. Install Android Studio (emulator) and, for iOS, Xcode (Mac only) or plan to build via EAS for a physical iPhone.
2. Log into EAS: `eas login` (needs an Expo account with access to this project).
3. Build the dev client:
   ```bash
   cd apps/mobile
   pnpm build:dev:android   # eas build --profile development --platform android
   pnpm build:dev:ios       # eas build --profile development --platform ios
   ```
4. Install the resulting build on the emulator/device (EAS gives a link/QR for the build artifact itself — this is a one-time app install, separate from the Metro QR code used during daily dev).

**Only redo this build when a native dependency changes** (new/upgraded native package, `app.json` plugin change, native config change). Regular TS/JS/business-logic changes never require a rebuild.

### Daily loop (fast — no rebuilds, no rescanning)

```bash
cd apps/mobile
pnpm dev   # expo start --dev-client — leave this running all session
```

- Open the dev client app once and connect to this Metro instance.
- Every code change hot-reloads on the emulator/device in ~1-2 seconds via Fast Refresh.
- **Never restart the server or scan a new QR code per change** — that was the old (slow, bug-prone) workflow. Only restart Metro for a stale-cache issue (`pnpm dev -- -c` / `expo start --dev-client -c`).
- Prefer the **Android emulator** for iteration: instant state resets (`adb shell pm clear com.baseballcoachesapp`), wired connection (no wifi flakiness), and full DevTools access. Reserve the physical Samsung/iPhone for final pre-demo checks.

### Catching scoring bugs before they reach a device

`deriveGameState` and the stats/pitch-count reducers in `packages/shared/src/utils/` are pure functions with solid Jest coverage already — run `pnpm --filter @baseball/shared test` (or `pnpm test`) after any scoring/event-sourcing change. Most of the bugs that used to surface only mid-live-game are reducer bugs that a unit test catches in seconds. Add a test case there before reaching for the emulator when fixing a scoring bug.

---

## Architecture

**Monorepo** — Turborepo + pnpm workspaces. TypeScript everywhere.

| Layer | Technology |
|-------|-----------|
| Mobile app | Expo SDK 51 + Expo Router v3 (React Native) |
| Web app | Next.js 14 (App Router) |
| Shared packages | `@baseball/shared`, `@baseball/database`, `@baseball/ui` |
| Backend | Supabase (Postgres + Realtime + Auth + Storage) |
| Offline storage (mobile) | WatermelonDB (SQLite via JSI) |
| Styling (mobile) | NativeWind v4 (Tailwind CSS for React Native) |
| Styling (web) | Tailwind CSS + shadcn/ui |
| Edge functions | Deno (Supabase Functions) |
| Push notifications | Expo Push Notifications |
| Deployment (web) | Vercel |
| Deployment (mobile) | Expo EAS Build |

### Key Architectural Decision: Event Sourcing

`game_events` is an **immutable append-only log**. Every pitch, out, and substitution is a row. Game state (score, count, baserunners) is derived by replaying events. This enables:
- Offline-first sync (events created on device, upserted to Supabase idempotently)
- Full audit trail for pitch count compliance
- Future analytics without schema changes

### RBAC

Roles: `head_coach`, `assistant_coach`, `player`, `parent`, `athletic_director`.
Enforced at three layers: Supabase RLS (primary), edge function JWT verification, client UI gating (cosmetic only).

### Directory Structure

```
baseballcoachesapp/
├── CLAUDE.md
├── .env.example
├── package.json           # Root workspace (turbo, eslint, prettier)
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── apps/
│   ├── web/               # Next.js 14 — admin dashboard + live score viewer
│   │   └── src/
│   │       ├── app/       # App Router pages
│   │       ├── components/
│   │       └── lib/supabase/
│   └── mobile/            # Expo React Native — offline-first scoring + messaging
│       ├── app/           # Expo Router file-system routing
│       └── src/
│           ├── db/        # WatermelonDB schema + models
│           ├── sync/      # Sync engine (WDB ↔ Supabase)
│           ├── features/  # scoring/, roster/, messaging/
│           ├── lib/       # supabase.ts, notifications.ts, device-id.ts
│           └── providers/ # AuthProvider, SyncProvider
│
├── packages/
│   ├── shared/            # Pure TS: types, constants, Zod schemas, pure utils
│   ├── database/          # Supabase client factory + generated types + query helpers
│   └── ui/                # Shared React Native component primitives
│
└── supabase/
    ├── migrations/        # 12 ordered SQL migration files
    ├── seed.sql
    └── functions/         # Deno edge functions
        ├── pitch-count-calculator/
        ├── push-notifications/
        ├── maxpreps-export/
        ├── create-team/
        └── invite-member/
```

---

## Key Conventions

### Code Style

- Prefer **explicit over implicit** — variable names should describe their purpose
- Keep functions **small and single-purpose**
- Avoid deeply nested logic; extract helpers when nesting exceeds 2-3 levels
- Prefer **early returns** over deeply nested conditionals
- Delete dead code rather than commenting it out

### Naming

| Entity | Convention | Example |
|--------|------------|---------|
| Files | kebab-case | `player-stats.ts` |
| Components | PascalCase | `RosterTable` |
| Functions/variables | camelCase | `getPlayerAverage()` |
| Constants | SCREAMING_SNAKE | `MAX_ROSTER_SIZE` |
| Database tables | snake_case | `player_stats` |
| CSS classes | kebab-case | `roster-card` |

### Testing

- Write tests for all business logic (statistics calculations, validation rules, etc.)
- Prefer unit tests for pure functions; integration tests for API endpoints
- Test files live alongside source files or in a dedicated `tests/` directory
- Use descriptive test names that read like sentences: `"should calculate ERA correctly for relief pitchers"`

### Error Handling

- Never swallow errors silently
- Log errors with enough context to debug (include relevant IDs, inputs, etc.)
- Return meaningful error messages to the client; never expose internal stack traces in production
- Validate all external input at system boundaries (API request bodies, user form input)

### Security

- Never commit secrets, API keys, or credentials — use environment variables
- Store sensitive config in a `.env` file (never committed); document required variables below
- Sanitize and validate all user-provided data before using it in queries or responses
- Follow the principle of least privilege for database access and API permissions

---

## Environment Variables

Copy `.env.example` to `.env.local` in each app directory. Never commit `.env` files.

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only (never client) | Supabase service role key |
| `EXPO_PUBLIC_SUPABASE_URL` | `apps/mobile/.env.local` | Supabase project URL (mobile) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env.local` | Supabase anon key (mobile) |
| `EXPO_PUBLIC_API_BASE_URL` | `apps/mobile/.env.local` | Deployed web app base URL — the mobile sync engine calls `POST {base}/api/games/:id/finalize` to complete games ended offline |
| `EXPO_ACCESS_TOKEN` | Supabase secrets | Expo push notification API token |
| `APP_URL` | Supabase secrets | Base URL for invite redirect |
| `CRON_SECRET` | Server-only (Vercel env) | Bearer token authorizing the scheduled league-snapshot rebuild route (`/api/cron/rebuild-league-snapshots`) |

---

## Database

- **Never** modify the Supabase schema manually — always use migrations in `supabase/migrations/`
- Migration files use timestamp prefix: `YYYYMMDDHHMMSS_<description>.sql`
- After adding a migration: run `supabase db reset` locally, then `pnpm --filter @baseball/database gen-types` to regenerate TypeScript types
- **Never** UPDATE or DELETE rows in `game_events` — the table is append-only by design
- After changing `supabase/migrations/`, update `packages/database/src/types/supabase.ts` (or regenerate it)
- The mobile WatermelonDB schema (`apps/mobile/src/db/schema.ts`) is versioned: **never** bump its `version` without adding a matching step in `apps/mobile/src/db/migrations.ts` — a bump without a migration wipes the device database, destroying unsynced offline game events

---

## Domain Glossary

Consistent naming helps avoid confusion between the codebase and baseball terminology.

| Term | Meaning |
|------|---------|
| **Coach** | A coaching staff member with app access |
| **Player** | An athlete on a roster |
| **Roster** | A list of players for a team or season |
| **Game** | A single scheduled or completed game |
| **Lineup** | The ordered batting order for a specific game |
| **Stats** | Performance statistics (batting, pitching, fielding) |
| **Drill** | A practice activity in a drill library |
| **Season** | A time period grouping games and rosters |
| **GameEvent** | An atomic timestamped action in a game (pitch, hit, out, sub, etc.) — the event sourcing primitive |
| **PitchCount** | Running total of pitches thrown by a pitcher in a game; tracked for compliance |
| **ComplianceRule** | A ruleset (e.g., NFHS, Little League) defining max pitches per day and required rest days |
| **QAB** | Quality At-Bat — a high-school-relevant metric crediting productive plate appearances regardless of traditional hit/out outcome |
| **Channel** | A messaging context: announcement (coach-post-only), topic (threaded), or direct (1:1) |
| **LeagueScoringSettings** | Per-league JSONB blob on `leagues.scoring_settings` that toggles non-standard scoring behaviors (expanded lineups, mercy rule, run cap, guest players, courtesy runners, etc.). Validated by `leagueScoringSettingsSchema` in `@baseball/shared`. |
| **GuestPlayer** | A player appearing in a lineup who is not on the home team's roster — either ad-hoc (free-text name) or an FK to another team's player. Tracked per-appearance via `game_lineups.is_guest` and gated by `settings.guests.allowed`. Creatable offline-first from mobile: RLS policy `coaches_insert_guest_only_players` lets active coaches insert guest-only identities directly, synced via WatermelonDB (`createLocalGuest` in `apps/mobile/src/features/lineup/local-guest.ts`). |
| **LeaguePlayer** | Registry row (`league_players` table) listing every player who has appeared in any team's game inside a league. Seeds the cross-season guest picker. |
| **MercyRule** | League-configurable game-ending rule: `gameLength.mercy = {enabled, runDiff, afterInning}`. The scoring engine surfaces an advisory banner when conditions are met; coach still confirms via End Game. |
| **RunCap** | League-configurable per-half-inning run limit (`gameLength.runCap = {enabled, value}`). Triggers an inning-switch advisory in the scoring UI. |
| **CourtesyRunner** | LL/HS substitution that pinch-runs for catcher/pitcher without burning a regular sub. `SubstitutionType.COURTESY_RUNNER`, gated on `settings.substitutions.courtesyRunnerForCatcherPitcher`. |
| **PlayerTransfer** | Append-only row in `player_transfers` recording a player's move within a league (initial assignment, trade, release, season reassignment). Written by league_admin server actions wrapping `fn_transfer_player` / `fn_release_player`, which also maintain `player_team_memberships` and the `players.team_id` denorm atomically. Coach-driven moves still write to the same table with NULL `league_id`. Does not drive stat attribution — that is derived by joining `game_lineups.game_id → games.team_id` (there is no `team_id` column on `game_lineups`), with guest appearances included/excluded via `count_toward_stats`. |
| **FreeAgent** | A player registered in a league (`league_players` row exists, `is_guest_only=false`) with `players.team_id IS NULL` and no active `player_team_memberships` row. Eligible for assignment to a team via `transferPlayer`. |
| **RunnerOutcome** | A per-runner result on a hit (or other parent play) that diverges from the default auto-advance. Modeled as a separate `BASERUNNER_OUT` (thrown out) or `BASERUNNER_ADVANCE` (held / advanced to a specific base) event whose `relatedEventId` points to the parent play. `deriveGameState` and the stats reducers suppress the parent's default scoring and base placement for any runner referenced by a linked outcome event. Keeps batter hit credit decoupled from runner fate — a double remains a double whether the lead runner scores, holds, or is thrown out. Surfaced in the play feed as a parenthetical on the parent row, e.g. "Double (Alice thrown out advancing, Bob held at 3B)". |
| **StatGroup** | The category a `StatDef` belongs to — `'batting' \| 'pitching' \| 'team' \| 'special'` — declared on every entry in `STAT_CATALOG`. Drives the public league-home **League Leaders** tabs (Batting / Pitching / Team / Special). The default board membership per tab lives in `GROUP_BOARDS` in `apps/web/src/lib/league-home/load.ts`; league-configured custom boards always render under **Special**. |
| **TeamStatPage** | Public read-only page at `/l/[slug]/team/[teamId]` showing a team's record, team-level stats, and full per-player batting/pitching lines. Assembled by `getTeamStatPageData` in `apps/web/src/lib/league-home/team-load.ts` as a `team_id`-filtered view of the existing `league_*_snapshot` tables — no migration, no new aggregation. Reached by clicking any team name on the league page (standings, leaderboards, spotlights, recent results). Opted-out players (`public_opt_out`) render a masked name with blanked (`—`) stat cells for public viewers. The URL builder `teamHref` lives in the non-server-only `team-href.ts` so client components (e.g. `LeaderBoard`) can import it without pulling in the `server-only` loader. The batting/pitching tables are client-sortable by any column (`SortablePlayerTable` + the pure `team-table-sort.ts`); opted-out players' numeric values are stripped to `null` server-side in `toTeamPlayerRows` (not just hidden) so they never reach the client payload, and such rows pin to the bottom of any numeric sort. |
| **DualScorekeeper** | League-wide opt-in (`leagues.scoring_settings.scorekeeping.dualScorekeeper`, default OFF, toggled in League Admin) that lets both teams independently score the same game. Implemented as **paired games**: each team keeps its own `games` row + immutable `game_events` log (no cross-team writes) — the rows are linked via `games.paired_game_id` and each records `games.scorer_side` (`'home'`/`'away'`). The home team's log is canonical. Requires the opponent to be a linked DiamondOS team (`opponent_teams.linked_team_id`); otherwise the toggle is a no-op. `provisionMirrorGame` (`apps/web/src/lib/dual-scorekeeper/provision.ts`) auto-creates the opponent's mirror game on creation. |
| **GameReconciliation** | Append-only `game_reconciliations` row (one per matchup, keyed on `home_game_id`) computed by `runReconciliationForGame` (`apps/web/src/lib/dual-scorekeeper/reconcile.ts`) at End Game **once both paired games are completed**. Diffs the two logs via the pure `reconcileScoreLogs` (`@baseball/shared`) at line-score level (final score, per-half-inning runs, team hits/errors; per-player batting/pitching diffs are supported by the util but await a cross-roster player-identity bridge). Surfaced on the completed-game page via `ReconciliationPanel`. The home team's coach can accept the away value per conflict (`resolved_overrides` JSON, written by `resolveReconciliationConflictAction`); overrides annotate the record and displayed line but never mutate `game_events`. RLS: either paired team reads, only the home coach writes. |
| **LineupSync** | Offline-first two-way sync of `game_lineups` between mobile (WatermelonDB mirror + dedicated lineup screen at `apps/mobile/app/(tabs)/games/[gameId]/lineup.tsx`) and Supabase. Pull is incremental via `game_lineups.updated_at` (trigger-maintained); push is a per-game whole-lineup replace guarded by the pure `decideLineupPush` in `@baseball/shared`: **mobile wins for `in_progress` games**, last-write-wins by timestamp otherwise (ties favor the device). Server-wins games converge on-device via `applyServerLineupSnapshot`. Web delete-reinserts propagate to devices as deletions via `computeLineupDeletes` (full id-set diff — Postgres has no tombstones). The `league_players` registry also mirrors locally to seed the offline guest picker; the identities themselves arrive via the PII-free `league_player_identities()` RPC (coach-only, no DOB/notes columns) rather than a `players` SELECT policy. |

Extend this glossary as domain concepts are added to the codebase.

For the authoritative baseball rules reference — MLB Official Baseball Rules structure, scoring conventions, fielder's-choice edge cases, and the NFHS / Little League / NCAA variants this app supports — see [`docs/baseball-rules.md`](docs/baseball-rules.md). Appendix B in that doc maps every `EventType` to its OBR citation.

---

## AI Assistant Guidelines

When working on this repository as an AI assistant:

1. **Read before writing** — Always read existing files before modifying them. Understand the context and patterns in use.
2. **Stay in scope** — Only change what is necessary for the task. Avoid refactoring unrelated code.
3. **Match existing conventions** — Follow the naming, formatting, and structure already established in the codebase.
4. **Document as you go** — If you add environment variables, commands, or domain concepts, update this file.
5. **Test coverage** — Add or update tests when modifying business logic.
6. **No secrets** — Never commit credentials, tokens, or passwords.
7. **Ask when uncertain** — If the task is ambiguous or would require a significant architectural decision, surface the ambiguity rather than guessing.
8. **Commit clearly** — Use Conventional Commits format with a descriptive scope and summary.
9. **Branch discipline** — Work on the designated branch; never push directly to `main`.
10. **Keep this file current** — Update CLAUDE.md whenever something significant changes in the project structure, stack, or conventions.

## Model & Effort Guidance


### Use high effort reasoning for:
- All multi-file code generation and refactoring
- Architecture decisions and new feature implementation
- Debugging complex or cross-cutting issues
- CodeRabbit fix loops
- Any task touching auth, data models, or API contracts


### Use medium effort for:
- Single-file edits and isolated bug fixes
- Writing or updating tests
- Code comments and inline documentation


### Use low effort for:
- Formatting and linting fixes
- Renaming variables or files
- Simple copy or string changes


## DiamondOS Context
- Primary stack: Render (hosting), Supabase (database), ZohoMail (mail), GitHub
- Always run coderabbit review after implementing a feature
- Commit after each discrete unit of work
