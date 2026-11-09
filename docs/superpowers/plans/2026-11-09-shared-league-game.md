# Shared League Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In leagues that schedule their own games, a league game is one shared game that either team can score (or an admin can enter by hand), and its one result credits both teams' standings and both teams' players' stats.

**Architecture:** A new `league_games` row owns the matchup and points at two paired, team-owned `games` rows (one per team), so every team-scoped path (RLS, sync, scoring, lineups) keeps working. Each team's roster is mirrored into a league-owned "roster record" (`opponent_teams.linked_team_id` + `opponent_players.linked_player_id`) that the other team scores against offline. A pure translator (`translateBookForSide`) rewrites a scorebook into either team's perspective, so the existing stat reducers produce per-team, per-player stats; the league snapshot for scheduled leagues is rebuilt from league games only.

**Tech Stack:** Supabase Postgres (migrations, RLS, plpgsql triggers), TypeScript, Next.js 14 (services + server actions + `/api/m/v1` routes), Expo + WatermelonDB, Jest (ts-jest on web/shared, jest-expo on mobile), zod.

**Spec:** `docs/superpowers/specs/2026-11-09-shared-league-game-design.md`

## Global Constraints

- Only leagues with `leagues.schedules_games = true` change behavior; every other league keeps today's behavior exactly (spec §0).
- `game_events` is append-only: no task updates or deletes event rows. Matching and settling work through links (`linked_player_id`) and overrides (`resolved_overrides`).
- RLS is primary authorization; services under `apps/web/src/lib/services/<area>/` use the `(db, actorUserId, rawInput: unknown) → Promise<ServiceResult<T>>` shape with `serviceOk` / `serviceError` / `invalidInput` from `lib/services/result.ts`, validating with zod schemas exported from `@baseball/shared`.
- Mobile routes wrap services exactly like `apps/web/src/app/api/m/v1/league-admin/[leagueId]/teams/[membershipId]/active/route.ts` (`requireApiUser` → service → `serviceResponse`).
- WatermelonDB schema goes from `version: 5` to `6` with a matching `toVersion: 6` step in `apps/mobile/src/db/migrations.ts`.
- New migrations are timestamped `20261101000000` or later. Hand-update `packages/database/src/types/supabase.ts` in the same task; apply to the database only in Task 18, after confirming the target with the user (prod is the only environment; SHAKEDOWN protocol; reconcile `schema_migrations.version` to the filename timestamp after MCP `apply_migration`).
- Tests: Jest, sibling `__tests__/` folders, names read as sentences ("should ..."). Web: `cd apps/web && npx jest <path>`. Shared: `cd packages/shared && npx jest <path>`. Mobile: `cd apps/mobile && pnpm jest <path>`.
- No raw hex or unthemed hues in web `components/` / `app/(app)/` or mobile (the `no-raw-colors` tests). New top-level `(app)` routes are not needed (new pages live under `league/admin/`).
- Commit after each task with Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Both dugouts score offline; the second book syncs after the first finished.** The server already shows the second team's row as completed (written from the paired book), so today's mobile sync would skip finalize and the discrepancy report would never run. Expected: the second book still finalizes, reconciles and notifies. Tests: Task 9 (`refreshLeagueGame` reconciles when both rows have events regardless of order) and Task 16 (finalize not skipped when `result_source = 'paired'`).
2. **A paired result arrives on a phone that is mid-game on that same row.** Expected: the local in-progress game and its unsynced events are untouched. Test: Task 16.
3. **A web-scored book stores the other team's ids under `batterId`/`pitcherId`.** Expected: attribution follows which roster the id belongs to, not which key holds it. Test: Task 4.
4. **A player traded or released mid-season.** Expected: each earlier league game stays with the team they played for; the leaderboard line is the combined season, shown with the most recent team. Test: Task 10.
5. **A hand-entered result exists, then a scorebook for the same game syncs.** Expected: the book counts, the hand entry is ignored, nothing counts twice. Tests: Task 5 (`selectResultSource`) and Task 11 (entry refused once a book has events).

---

## Phase A — Data model

### Task 1: Schema for league games, roster links, hand-entered results and per-team snapshots

**Files:**
- Create: `supabase/migrations/20261101000000_league_scheduled_games.sql`
- Modify: `packages/database/src/types/supabase.ts`

**Interfaces:**
- Produces (columns/tables every later task uses):
  - `leagues.schedules_games boolean not null default false`
  - `league_games(id uuid pk, league_id uuid not null → leagues on delete cascade, season text not null, home_team_id uuid not null → teams, away_team_id uuid not null → teams, home_game_id uuid unique → games on delete set null, away_game_id uuid unique → games on delete set null, scheduled_at timestamptz not null, time_zone text, venue_name text, status text not null default 'scheduled' check in ('scheduled','completed','cancelled'), created_by uuid → auth.users, created_at, updated_at)`; check `home_team_id <> away_team_id`; index `(league_id, season, scheduled_at)`.
  - `games.league_game_id uuid → league_games on delete set null` (indexed), `games.result_source text check in ('paired','manual')` (null = the row's own book or a normal game).
  - `opponent_players.linked_player_id uuid → players on delete set null`, `opponent_players.placeholder_game_id uuid → league_games on delete cascade`, `opponent_players.is_fill_in boolean not null default false`; unique partial index `(opponent_team_id, linked_player_id) where linked_player_id is not null and placeholder_game_id is null`.
  - Unique partial index on `opponent_teams (league_id, linked_team_id) where league_id is not null and linked_team_id is not null` (one roster record per team per league).
  - `league_game_manual_results(league_game_id uuid pk → league_games on delete cascade, kind text not null check in ('final','box','batting','forfeit'), home_runs int, away_runs int, home_inning_runs int[], away_inning_runs int[], home_hits int, away_hits int, home_errors int, away_errors int, forfeit_winner_team_id uuid → teams, entered_by uuid not null → auth.users, entered_at timestamptz not null default now(), updated_at timestamptz not null default now())`.
  - `league_game_manual_batting_lines(id uuid pk, league_game_id uuid not null → league_game_manual_results on delete cascade, team_id uuid not null → teams, player_id uuid not null → players, ab, r, h, doubles, triples, hr, rbi, bb, so, hbp, sf, sb int not null default 0 check >= 0)`; unique `(league_game_id, player_id)`.
  - `league_player_stat_snapshot.scope text not null default 'season' check in ('season','team')`; primary key becomes `(league_id, season, scope, player_id, team_id)`.
- RLS: enable on the three new tables. `league_games` SELECT for `is_league_staff(league_id, auth.uid())` or an active `team_members` row on `home_team_id`/`away_team_id`. Manual tables: SELECT with the same predicate via the parent league game. No write policies (services write with the service role).

- [ ] **Step 1: Write the migration** with the DDL above, `trg_league_games_touch_updated_at` reusing the existing touch-updated-at function, and comments on each new column stating its meaning.
- [ ] **Step 2: Hand-update `supabase.ts`** for every new table/column (Row/Insert/Update + Relationships), matching the generated style.
- [ ] **Step 3: Verify types compile:** `pnpm type-check` → exits 0.
- [ ] **Step 4: Commit** `feat(db): league games, roster links, manual results, per-team snapshots`.

### Task 2: League roster records kept in step with team rosters

**Files:**
- Create: `supabase/migrations/20261101000001_league_roster_records.sql`

**Interfaces:**
- Produces: `public.sync_league_roster_record(p_league_id uuid, p_team_id uuid) returns uuid` (SECURITY DEFINER, `search_path = public`), returning the roster record's `opponent_teams.id`. It:
  - upserts `opponent_teams (league_id, linked_team_id, name = teams.name, team_id = null)`;
  - upserts one non-placeholder `opponent_players` row per player with `players.team_id = p_team_id` and not guest-only: `linked_player_id`, first/last name, jersey (as text), primary_position, bats, throws, `is_active = players.is_active`, `updated_at = now()`;
  - sets `is_active = false` (never deletes) on non-placeholder linked rows whose player no longer has `team_id = p_team_id`.
  - Does nothing unless the league has `schedules_games = true`.
- Triggers (all AFTER, FOR EACH ROW, calling the function for each affected scheduled league via `league_members` where `team_id` matches and `is_active`):
  - `league_members` INSERT/UPDATE with non-null `team_id`;
  - `players` INSERT/UPDATE OF `first_name, last_name, jersey_number, primary_position, bats, throws, team_id, is_active` (old and new team);
  - `teams` UPDATE OF `name`;
  - `leagues` UPDATE OF `schedules_games` when it becomes true (every active member team).

- [ ] **Step 1: Write the migration** (function + four trigger functions + triggers). Revoke EXECUTE on `sync_league_roster_record` from public/anon/authenticated; grant to service_role.
- [ ] **Step 2: Add `sync_league_roster_record` to `supabase.ts` Functions.**
- [ ] **Step 3: Commit** `feat(db): mirror league team rosters into league roster records`.

SQL behavior is verified against the database in Task 18 (queries listed there).

### Task 3: Access rules for league games

**Files:**
- Create: `supabase/migrations/20261101000002_league_game_rls.sql`

**Interfaces:**
- Produces helper `public.is_league_game_row(p_game_id uuid) returns boolean` (exists in `league_games` as home or away game) and `public.league_game_staff(p_game_id uuid, p_user_id uuid) returns boolean` (`is_league_staff` of that league game's league). Both SECURITY DEFINER, STABLE.
- New policies (additive; none replaced):
  - `games` SELECT `league_staff_view_league_games`: `league_game_staff(id, auth.uid())`.
  - `game_events` SELECT and INSERT `league_staff_score_league_games`: the event's game is the **home** row of a league game whose league has `auth.uid()` as active staff.
  - `game_lineups` and `opponent_game_lineups` ALL `league_staff_manage_league_game_lineups`: same home-row predicate.
  - `opponent_game_lineups` ALL `scorekeepers_manage_league_opponent_lineups`: game is a league-game row and `is_scorekeeper(g.team_id, auth.uid())`.
  - `opponent_teams` and `opponent_players` SELECT `league_members_view_league_roster_records`: record has `league_id` and `linked_team_id`, league `schedules_games`, and `is_league_member(league_id, auth.uid())`.
  - `opponent_players` ALL `league_game_scorers_manage_placeholders` (USING = WITH CHECK): `placeholder_game_id is not null`, and the placeholder's league game has a row (home or away) whose `team_id` the user `is_scorekeeper` or `is_coach` on, and `opponent_team_id` is that row's `opponent_team_id`.

- [ ] **Step 1: Write the migration.**
- [ ] **Step 2: Add the two helpers to `supabase.ts` Functions; commit** `feat(db): league staff scoring and placeholder access for league games`.

Policies are verified in Task 18 by acting as a scorekeeper (not a head coach) inserting a placeholder and an opponent lineup row, and as league staff inserting a `game_events` row on a home row (succeeds) and an away row (refused).

---

## Phase B — Pure logic (shared)

### Task 4: Translate a scorebook into either team's perspective

**Files:**
- Create: `packages/shared/src/utils/league-game-book.ts`, `packages/shared/src/utils/__tests__/league-game-book.test.ts`
- Modify: `packages/shared/src/utils/index.ts` (export)

**Interfaces:**
- Produces:
  ```ts
  export interface SideIdMap {
    /** id appearing in the book → this side's real players.id */
    toOurPlayer: ReadonlyMap<string, string>;
    /** id appearing in the book → id to use for the other side */
    toOpponent: ReadonlyMap<string, string>;
  }
  export const PLACEHOLDER_PREFIX = 'placeholder:';
  export function translateBookForSide(events: Record<string, unknown>[], map: SideIdMap): Record<string, unknown>[];
  export function buildSideIdMaps(input: {
    scoringTeamPlayerIds: readonly string[];
    rosterRecordPlayers: readonly { id: string; linkedPlayerId: string | null; isPlaceholder: boolean; isFillIn: boolean }[];
    /** the non-scoring team's roster record for the scoring team: linked opponent_player id per scoring-team player */
    reverseLinks: ReadonlyMap<string, string>;
  }): { scoringSide: SideIdMap; otherSide: SideIdMap };
  ```
- Rules: every string value anywhere in a payload (deep, including arrays such as `fieldingSequence`) equal to a mapped id is replaced. Then batter/pitcher keys are normalized: an id resolved through `toOurPlayer` goes under `batterId` / `pitcherId`; any other id goes under `opponentBatterId` / `opponentPitcherId`; the other key of the pair is removed. Unmatched placeholders and fill-ins map to `placeholder:<opponent_player id>` on their own side (so reducers count them in team totals). Events are not mutated (returns copies).

- [ ] **Step 1: Write failing tests:**
  - `should put the other team's linked players under batterId when translating for that team` — away-scored book with `opponentBatterId: 'opp-7'` linked to `'p-7'` → for the home side, `payload.batterId === 'p-7'` and no `opponentBatterId`.
  - `should attribute by roster membership when the web scorer stored opponent ids under batterId` (Review Focus 3) — `batterId: 'opp-7'` → for the home side, `batterId === 'p-7'`; for the scoring side, `opponentBatterId === 'opp-7'`.
  - `should map an unmatched placeholder to a placeholder id on its own side` → `batterId === 'placeholder:opp-99'`.
  - `should replace ids nested in arrays such as fieldingSequence`.
  - `should not mutate the input events`.
- [ ] **Step 2: Run** `cd packages/shared && npx jest src/utils/__tests__/league-game-book.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** both functions.
- [ ] **Step 4: Run the tests** → PASS.
- [ ] **Step 5: Commit** `feat(shared): translate a league scorebook into either team's perspective`.

### Task 5: Result source, league standings and hand-entered batting lines

**Files:**
- Create: `packages/shared/src/utils/league-game-result.ts`, `packages/shared/src/utils/__tests__/league-game-result.test.ts`
- Modify: `packages/shared/src/utils/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ResultSource =
    | { kind: 'none' }
    | { kind: 'manual' }
    | { kind: 'single'; side: 'home' | 'away' }
    | { kind: 'dual'; scoreFrom: 'home' | 'away'; playerLineFrom: ReadonlyMap<string, 'home' | 'away'> };
  export function selectResultSource(input: {
    home: { completed: boolean; eventCount: number };
    away: { completed: boolean; eventCount: number };
    reconciliation: { conflicts: ScoreConflict[]; overrides: ReconciliationOverride[] } | null;
    hasManualResult: boolean;
  }): ResultSource;
  export interface LeagueGameResult { homeTeamId: string; awayTeamId: string; homeRuns: number; awayRuns: number; forfeitWinnerTeamId: string | null }
  export function computeLeagueGameStandings(results: readonly LeagueGameResult[], teamIds: readonly string[]): Map<string, TeamRecord>;
  export interface ManualBattingLine { playerId: string; ab: number; r: number; h: number; doubles: number; triples: number; hr: number; rbi: number; bb: number; so: number; hbp: number; sf: number; sb: number }
  export function manualLinesToBattingStats(lines: readonly ManualBattingLine[]): Map<string, BattingStats>;
  export function mergeBattingStats(a: BattingStats, b: BattingStats): BattingStats;
  export function mergePitchingStats(a: PitchingStats, b: PitchingStats): PitchingStats;
  ```
  `TeamRecord` moves here from `apps/web/src/lib/league-snapshot/standings.ts` (re-export it there).
- Rules: a book counts only if its row is completed **and** has events. Books always beat a hand entry (Review Focus 5). `dual`: `scoreFrom` is `'away'` iff an override with `useAwayValue` exists for the `final_score` conflict; `playerLineFrom` sets `'away'` for each player with any `player_batting`/`player_pitching` override using the away value. Forfeit: winner +1 W, loser +1 L, runs not added. Merges sum counts and recompute rates the same way the reducers do; hand-entered lines add 0 to the QAB and hard-hit numerators and denominators.

- [ ] **Step 1: Write failing tests:**
  - `should use the only completed book` → `{ kind: 'single', side: 'away' }` when only the away row has events.
  - `should prefer a scorebook over a hand-entered result` → home has events, `hasManualResult: true` → `single`/home.
  - `should take the final score from the away book when the home coach accepted it`.
  - `should take a player's whole line from the away book when any of their stats was overridden`.
  - `should return none when no book is complete and nothing was entered`.
  - `should count a forfeit as a win and a loss without runs`.
  - `should compute AVG, OBP, SLG and OPS from hand-entered lines` — `ab 4, h 2, doubles 1, bb 1` → avg `0.5`, obp `0.6`, slg `0.75`.
  - `should leave hand-entered games out of QAB percentage` — merge a reducer line with QAB data and a manual line → `qabPct` equals the reducer line's.
- [ ] **Step 2: Run** `cd packages/shared && npx jest src/utils/__tests__/league-game-result.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; also `cd apps/web && npx jest src/lib/league-snapshot` → PASS (the re-export didn't break standings tests).
- [ ] **Step 5: Commit** `feat(shared): league game result source, standings and hand-entered lines`.

### Task 6: Validation schemas for league games

**Files:**
- Create: `packages/shared/src/validation/league-games.ts`, `packages/shared/src/validation/__tests__/league-games.test.ts`
- Modify: `packages/shared/src/validation/index.ts`

**Interfaces:**
- Produces (all `z.object(...).strict()`, ids are uuids):
  - `createLeagueGameInputSchema { leagueId, homeTeamId, awayTeamId, date: 'YYYY-MM-DD', time: 'HH:MM', timeZone: string, venueName?: string }` with a refine that home ≠ away.
  - `updateLeagueGameInputSchema { leagueGameId, date?, time?, timeZone?, venueName? }`; `leagueGameIdInputSchema { leagueGameId }`; `listLeagueGamesInputSchema { leagueId, season?: string }`.
  - `manualResultInputSchema`: discriminated union on `kind`: `final { homeRuns, awayRuns }`, `box { homeInningRuns: number[], awayInningRuns: number[], homeHits, awayHits, homeErrors, awayErrors }` (runs derived as sums), `batting` = `box` + `lines: { teamId, playerId, ab..sb }[]` (each line `h >= doubles + triples + hr`, `h <= ab`), `forfeit { winnerTeamId }`; every variant also carries `leagueGameId`. All counts are ints ≥ 0.
  - `resolvePlaceholderInputSchema`: union on `action`: `link { placeholderId, playerId }`, `create { placeholderId, firstName, lastName, jerseyNumber?: number }`, `fill_in { placeholderId }`.
  - `listPlaceholdersInputSchema`: `{ leagueId } | { leagueGameId }`.

- [ ] **Step 1: Write failing tests** — `should reject a game where a team plays itself`, `should reject a batting line with more hits than at-bats`, `should derive no runs field for box results (sums are computed by the service)`, `should accept a forfeit with only a winner`.
- [ ] **Step 2: Run** `cd packages/shared && npx jest src/validation/__tests__/league-games.test.ts` → FAIL.
- [ ] **Step 3: Implement**; export types `CreateLeagueGameInput`, `ManualResultInput`, `ResolvePlaceholderInput`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shared): validation for league games, hand-entered results and placeholders`.

---

## Phase C — League teams and games (web)

### Task 7: League-managed teams and the "league schedules games" setting

**Files:**
- Create: `apps/web/src/lib/services/league-admin/league-managed-teams.ts`, `__tests__/league-managed-teams.test.ts`
- Modify: `apps/web/src/app/(app)/league/setup/actions.ts:85-116`, `apps/web/src/app/(app)/league/admin/actions.ts`, `apps/web/src/app/(app)/league/admin/LeagueAdminClient.tsx` (League Details + Teams sections), `packages/shared/src/validation/league-admin.ts`

**Interfaces:**
- Consumes: `authorizeLeagueStaff(db, actor, leagueId, { requireAdmin: true })`.
- Produces:
  - `createLeagueManagedTeam(db, actorUserId, rawInput): Promise<ServiceResult<{ teamId: string }>>` — schema `createLeagueManagedTeamInputSchema { leagueId, name (1-100), divisionId?: uuid }`. Inserts `teams { name, created_by: actor, level: league.level ?? 'high_school' }` and `league_members { league_id, team_id, division_id, is_active: true }` (the Task 2 trigger creates its roster record). No `team_members`. Deletes the team if the membership insert fails.
  - `setLeagueSchedulesGames(db, actorUserId, rawInput): Promise<ServiceResult<{ schedulesGames: boolean }>>` — schema `{ leagueId, schedulesGames: boolean }`, league admins only.
- Wizard: when `leagueType === 'adult'`, set `schedules_games = true` and create each team with `createLeagueManagedTeam` instead of an `opponent_teams` row. Other league types are unchanged.
- Admin UI: a "League schedules games" switch in League Details; when on, the Teams section's "Create opponent team" form is replaced by "Create team" (calls the new action). Copy: "Create team" / "Teams created here are run by the league until a coach joins."

- [ ] **Step 1: Write failing tests** — `should create a team and its league membership without any team members`, `should refuse a league manager`, `should remove the team when the membership insert fails`, `should turn the setting on for a league admin`.
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/services/league-admin/__tests__/league-managed-teams.test.ts` → FAIL.
- [ ] **Step 3: Implement the services, schemas, actions, wizard branch and admin UI.**
- [ ] **Step 4: Run** → PASS; `pnpm type-check` → 0.
- [ ] **Step 5: Commit** `feat(league): league-managed teams and the schedules-games setting`.

### Task 8: Create, edit, cancel and list league games

**Files:**
- Create: `apps/web/src/lib/services/league-games/league-games.ts`, `apps/web/src/lib/services/league-games/ensure-team-season.ts`, `apps/web/src/lib/services/league-games/__tests__/league-games.test.ts`
- Modify: `apps/web/src/lib/dual-scorekeeper/provision.ts:31` (return null when the team's league has `schedules_games`)

**Interfaces:**
- Consumes: `createLeagueGameInputSchema`, `updateLeagueGameInputSchema`, `leagueGameIdInputSchema`, `listLeagueGamesInputSchema` (Task 6); `zonedDateTimeToUtc` (`@baseball/shared`); `authorizeLeagueStaff`.
- Produces:
  - `ensureTeamSeason(db: SupabaseClient, teamId: string, seasonName: string, fallbackStart: string): Promise<string>` — returns the id of the team's season with that name, creating it inactive if missing (dates from `seasonFor` when the name is `Spring|Summer|Fall <year>`, else `fallbackStart`).
  - `createLeagueGame(db, actor, raw): Promise<ServiceResult<{ leagueGameId: string; homeGameId: string; awayGameId: string }>>` — league admins; both teams must be active members; season = `leagues.current_season` (`invalid` "Set the league's current season first." when null). Inserts home row (`location_type 'home'`, `scorer_side 'home'`, `opponent_team_id` = away team's roster record, `opponent_name` = away team name, `league_game_id`), away row (mirror), pairs them, then `league_games`.
  - `updateLeagueGame(db, actor, raw)` — applies time/zone/venue to the league game and both rows; `conflict` when the league game is completed.
  - `cancelLeagueGame(db, actor, raw)` — sets `cancelled` on the league game and both rows (Task 9 adds the league refresh for a cancelled completed game).
  - `listLeagueGames(db, actor, raw): Promise<ServiceResult<{ games: LeagueGameListItem[] }>>` where `LeagueGameListItem = { id; season; scheduledAt; timeZone; venueName; status; home: { teamId; name; gameId }; away: { teamId; name; gameId }; homeRuns: number | null; awayRuns: number | null; hasManualResult: boolean; needsSettling: boolean }`. Any league staff.

- [ ] **Step 1: Write failing tests** — `should create two paired team games pointing at each other's roster records`, `should store the start time in the given time zone`, `should create the team season when it is missing`, `should refuse a team that is not an active member`, `should cancel both team games`, `should refuse to edit a completed league game`, `should not provision a mirror for a team-created game in a league that schedules games` (provision test).
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/services/league-games src/lib/dual-scorekeeper` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(league): create, edit, cancel and list league games`.

### Task 9: Refresh a league game after it changes; settle and notify two-book games

**Files:**
- Create: `apps/web/src/lib/league-games/refresh.ts`, `apps/web/src/lib/league-games/side-maps.ts`, `apps/web/src/lib/notifications/send-push.ts`, `apps/web/src/lib/league-games/__tests__/refresh.test.ts`
- Modify: `apps/web/src/lib/games/finalize.ts:194-224`, `apps/web/src/lib/dual-scorekeeper/reconcile.ts:44`, `apps/web/src/lib/services/games/resolve-reconciliation-conflict.ts`, `apps/web/src/lib/dual-scorekeeper/load.ts`

**Interfaces:**
- Consumes: `translateBookForSide`, `buildSideIdMaps` (Task 4); `selectResultSource` (Task 5); `deriveBattingStats`, `derivePitchingStats`, `reconcileScoreLogs`; `recomputeLeagueSnapshot`.
- Produces:
  - `loadSideIdMaps(db, leagueGameId): Promise<{ homeBook: { scoringSide: SideIdMap; otherSide: SideIdMap }; awayBook: { scoringSide: SideIdMap; otherSide: SideIdMap } }>` in `side-maps.ts` (reads both teams' players and both roster records; `homeBook.otherSide` is the away team's view of the home team's book, and so on).
  - `refreshLeagueGame(db: SupabaseClient, leagueGameId: string, actorUserId?: string): Promise<void>` — in order: (1) count events and read status of both rows; (2) when both rows are completed with events, run reconciliation if none exists or it was computed before the latest event of either row, and notify (step 4) only when it was newly created; (3) resolve the result source; set `league_games.status = 'completed'` when any source exists; write `status 'completed'`, `home_score`, `away_score`, `result_source 'paired'` onto a row that has **no events and status `scheduled`** (never onto an `in_progress` row); (4) `sendPush` to active head coaches, assistant coaches, athletic directors and scorekeepers of each team, `data: { kind: 'game', gameId: <that team's row> }`, title "Scorebooks don't match", body "Both teams scored <home> vs <away>. Review the differences."; (5) `recomputeLeagueSnapshot(db, leagueId, season)`. Errors are logged with the league game id and never thrown to the caller.
  - `sendPush(db: SupabaseClient, input: { userIds: string[]; title: string; body: string; data?: Record<string, unknown> }): Promise<void>` — `db.functions.invoke('push-notifications', { body: input })`, logging errors.
  - `runReconciliationForGame` gains per-player diffs for league games: it passes `batting`/`pitching` maps from both books translated into real player ids (union of both teams).
  - `authorizeReconciliationSettler(db, actorUserId, homeGameId): Promise<ServiceResult<void>>` — allowed: coach (head, assistant, AD) of the home team; league admin of the league game's league; coach of the away team **only when** the home team has no active head/assistant coach. `resolveReconciliationConflict` uses it instead of `authorizeGameCoach`, then calls `refreshLeagueGame`. `ReconciliationView` gains `canSettle: boolean` computed the same way for the viewer.
- `finalizeGame`: when the game row has `league_game_id`, call `refreshLeagueGame` instead of the `league_members` loop (and clear `result_source` on the row being finalized).
- `cancelLeagueGame` (Task 8): when the league game was completed, call `refreshLeagueGame` after cancelling (test: `should refresh the league when a completed league game is cancelled`).

- [ ] **Step 1: Write failing tests:**
  - `should reconcile when the second book completes after the paired result was written` (Review Focus 1) — away row completed with events and `result_source 'paired'` from an earlier refresh, then finalized → reconciliation upserted and push sent to both teams.
  - `should write the result onto a scheduled row with no events`.
  - `should never write onto an in-progress row`.
  - `should not send a second push when the reconciliation already exists and nothing changed`.
  - `should let the away coach settle when the home team has no coaches` and `should refuse the away coach when the home team has a coach`.
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/league-games src/lib/services/games` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS, plus `npx jest src/lib/__tests__/finalize-authz.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(league): refresh league games on finalize and settle two-book games`.

### Task 10: League snapshot built from league games

**Files:**
- Create: `apps/web/src/lib/league-snapshot/scheduled/load-inputs.ts`, `.../scheduled/side-stats.ts`, `.../scheduled/recompute-scheduled.ts`, `.../scheduled/__tests__/side-stats.test.ts`, `.../scheduled/__tests__/recompute-scheduled.test.ts`
- Modify: `apps/web/src/lib/league-snapshot/recompute.ts` (dispatch), `apps/web/src/lib/league-snapshot/aggregate.ts`, `apps/web/src/lib/league-home/load.ts`, `apps/web/src/lib/league-home/team-load.ts:201`, `apps/web/src/lib/league-stats/load.ts:185`

**Interfaces:**
- Consumes: Tasks 4, 5, 9 (`loadSideIdMaps`).
- Produces:
  - `loadScheduledLeagueInputs(db, leagueId, season): Promise<ScheduledLeagueInputs>` — league games (not cancelled), both rows, events (`fetchAllEventsForGames`, `filterResetAndReverted`), reconciliations, manual results + lines, side maps, team names, players, opt-outs.
  - `deriveSideStats(input: { events; sideMap: SideIdMap; sidePlayers: { id; firstName; lastName }[]; lineup: BattingLineupContext | undefined }): { batting: Map<string, BattingStats>; pitching: Map<string, PitchingStats> }` — keys are real player ids or `placeholder:` ids.
  - `recomputeScheduledLeagueSnapshot(db, leagueId, season): Promise<void>` — per league game: resolve the source; for `single`/`dual`, derive each side's stats from the chosen book(s) (for `dual`, a player's line comes from `playerLineFrom`); for `manual`, use `manualLinesToBattingStats`. Writes `scope 'team'` player rows keyed `(player, team they played for)`, `scope 'season'` rows merging every team's line with `team_id` = the team of their latest league game, team stat rows (totals include placeholder lines), standings via `computeLeagueGameStandings`, spotlights as today. Checks every delete/insert error and throws with league and season in the message.
  - `recomputeLeagueSnapshot` reads `leagues.schedules_games` and calls `recomputeScheduledLeagueSnapshot` when true; the existing path writes `scope 'season'` and `scope 'team'` rows (identical stats) so loaders work for both.
  - Loaders: leaderboards and the league stats page read `scope = 'season'`; the team page reads `scope = 'team'` with `team_id = teamId`.

- [ ] **Step 1: Write failing tests:**
  - `should credit both teams' players from a book only the home team scored`.
  - `should keep a traded player's earlier games with their old team and combine the season line under the new team` (Review Focus 4).
  - `should count placeholder at-bats in team totals but not on player rows`.
  - `should ignore team-created games in a league that schedules games`.
  - `should count a forfeit in the standings without runs`.
  - `should throw when a snapshot insert fails`.
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/league-snapshot src/lib/league-home src/lib/league-stats` → new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → all PASS.
- [ ] **Step 5: Commit** `feat(league): build league standings and stats from league games`.

### Task 11: Hand-entered results

**Files:**
- Create: `apps/web/src/lib/services/league-games/manual-result.ts`, `__tests__/manual-result.test.ts`, `apps/web/src/app/(app)/league/admin/games/[leagueGameId]/result/page.tsx`, `.../result/ManualResultForm.tsx`, `.../result/actions.ts`, `apps/web/src/app/api/m/v1/league-games/[leagueGameId]/manual-result/route.ts`

**Interfaces:**
- Consumes: `manualResultInputSchema`; `refreshLeagueGame`.
- Produces: `enterManualResult(db, actor, raw): Promise<ServiceResult<{ leagueGameId: string }>>` and `loadManualResult(db, actor, raw: { leagueGameId }): Promise<ServiceResult<{ result: ManualResultInput | null; rosters: { teamId; players: { id; name; jersey }[] }[]; canEdit: boolean }>>`.
- Rules: `conflict` "This game was scored in the app; settle it from the game page." when either row has any events (Review Focus 5). Who: league admins; head/assistant coaches and ADs of either team; a later edit by a coach is refused when the existing entry was made by a league admin (unless the actor is a league admin); the home team's coaches may replace an away coach's entry. Lines' `teamId` must be the home or away team and `playerId` on that team's roster. Box/batting runs = sum of inning runs. Upserts the result, replaces lines, then `refreshLeagueGame`. Route: `GET` → `loadManualResult`, `POST` → `enterManualResult`.
- Form: a kind picker (Final score / Box score / Batting stats / Forfeit); box shows one row of inning cells per team (count = the longest of the two, at least the league's `gameLength.maxInnings`); batting adds a table per team (player select + AB R H 2B 3B HR RBI BB SO HBP SF SB) with "Add player" using the placeholder create path from Task 12.

- [ ] **Step 1: Write failing tests** — `should refuse a hand entry once either team's book has events`, `should sum inning runs into the final score`, `should refuse a coach editing a league admin's entry`, `should let the home coach replace the away coach's entry`, `should refuse a batting line for a player on neither team`, `should refresh the league after saving`.
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/services/league-games/__tests__/manual-result.test.ts` → FAIL.
- [ ] **Step 3: Implement service, route, page, form, actions.**
- [ ] **Step 4: Run** → PASS; `pnpm type-check` → 0.
- [ ] **Step 5: Commit** `feat(league): hand-entered league game results`.

### Task 12: Matching unknown players after the game

**Files:**
- Create: `apps/web/src/lib/services/league-games/placeholders.ts`, `__tests__/placeholders.test.ts`, `apps/web/src/components/league-games/UnmatchedPlayersPanel.tsx`, `apps/web/src/app/(app)/league/admin/games/unmatched/page.tsx`, `apps/web/src/app/(app)/games/[gameId]/placeholder-actions.ts`, `apps/web/src/app/api/m/v1/league-games/placeholders/route.ts`, `.../placeholders/[placeholderId]/route.ts`
- Modify: `apps/web/src/lib/services/opponent-lineup/opponent-roster.ts:29` (`addOpponentPlayer` accepts `placeholder: true` for league-game rows and sets `placeholder_game_id`), `apps/web/src/app/(app)/games/[gameId]/page.tsx` (render the panel on completed league games)

**Interfaces:**
- Produces:
  - `listUnmatchedPlaceholders(db, actor, raw): Promise<ServiceResult<{ placeholders: { id; leagueGameId; gameLabel; teamId; teamName; label; jerseyNumber: string | null; canResolve: boolean }[] }>>` — by league (league staff) or by league game (staff or coaches of either team). Only rows with `placeholder_game_id`, no `linked_player_id`, and `is_fill_in = false`.
  - `resolvePlaceholder(db, actor, raw): Promise<ServiceResult<{ playerId: string | null }>>` — `link` (player must be on the placeholder's team, i.e. `players.team_id` = record's `linked_team_id`, or have played for it), `create` (service-role inserts `players { team_id, first/last, jersey }`, `player_team_memberships` active, `league_players`; jersey taken → `conflict`), `fill_in` (sets `is_fill_in`). Then `refreshLeagueGame`.
  - `canResolvePlaceholder(db, actor, placeholderId): Promise<boolean>` — league admin; coach (head/assistant/AD) or scorekeeper of the team whose row has the placeholder's record as `opponent_team_id` (the team that scored against them); coach of the placeholder's own team.

- [ ] **Step 1: Write failing tests** — `should link a placeholder to a player and refresh the league`, `should create a roster player from a placeholder`, `should report a taken jersey number as a conflict`, `should let the placeholder's own team coach match it`, `should refuse a coach from an unrelated team`, `should hide fill-ins from the unmatched list`.
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/services/league-games/__tests__/placeholders.test.ts` → FAIL.
- [ ] **Step 3: Implement services, routes, panel (game page) and league-wide page.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(league): match unknown players after league games`.

### Task 13: League games admin page and admin web scoring

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/games/page.tsx`, `.../games/LeagueGamesClient.tsx`, `.../games/actions.ts`, `apps/web/src/app/api/m/v1/league-admin/[leagueId]/games/route.ts`
- Modify: `apps/web/src/components/layout/Sidebar.tsx:100-102`, `apps/web/src/app/(app)/games/[gameId]/score/page.tsx`, `apps/web/src/app/(app)/games/[gameId]/lineup/page.tsx` and `.../opponent-lineup/page.tsx` (access checks), `apps/web/src/lib/services/games/authorize.ts`

**Interfaces:**
- Consumes: Task 8 services, Task 11 page, Task 12 page.
- Produces: `authorizeLeagueGameScorer(db, actorUserId, gameId): Promise<boolean>` — true for league staff of the league game when `gameId` is its **home** row. Score, lineup and opponent-lineup pages accept it alongside today's team checks.
- Page: shown only when `schedules_games`; a list of the current season's league games (date, home, away, venue, status, score) with Add game (home/away team selects, date, time, time zone defaulting to the browser zone, venue), Edit time/venue, Cancel (confirm dialog), Enter result (Task 11, only when unscored), Score on web (home row's score page), and a link to Unmatched players (Task 12) with a count. Sidebar entry "League Games" under League Admin. Route `GET` → `listLeagueGames`, `POST` → `createLeagueGame`.

- [ ] **Step 1: Write failing tests** — `should let league staff score the home row of a league game` and `should refuse league staff on the away row` (authorize test); route test `should list league games for staff` in `apps/web/src/app/api/m/v1/league-admin/__tests__/`.
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/services/games src/app/api/m/v1/league-admin` → FAIL.
- [ ] **Step 3: Implement the page, actions, route, sidebar entry and access checks.**
- [ ] **Step 4: Run** → PASS; `pnpm type-check` and `pnpm lint` → 0 (including `no-raw-colors`).
- [ ] **Step 5: Commit** `feat(league): league games admin page and league staff web scoring`.

### Task 14: The team that didn't score sees the game and its stats

**Files:**
- Create: `apps/web/src/lib/league-games/paired-book.ts`, `__tests__/paired-book.test.ts`
- Modify: `apps/web/src/lib/stats/load-season-stats.ts:94`, `apps/web/src/lib/game-stats/load-game-stats.ts:69`, `apps/web/src/lib/services/dashboard/load-dashboard.ts`, `packages/shared/src/validation/dashboard.ts`, `apps/web/src/app/(app)/games/[gameId]/page.tsx:335-344`, `apps/web/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `loadSideIdMaps`, `translateBookForSide`.
- Produces:
  - `loadEventsForTeamGames(db, teamId, games: { id; league_game_id: string | null; result_source: string | null }[], eventTypes): Promise<Record<string, unknown>[]>` — own events for normal rows; for `result_source = 'paired'` rows, the paired row's events translated with that team's side map and re-keyed to the team's own game id. `loadTeamSeasonStats` and `loadGameStats` use it.
  - `DashboardResponse.pendingSettlements: { gameId: string; label: string }[]` — completed league games of the team with an unresolved reconciliation (any conflict without an override and `resolved_at` null).
- Game page: `ReconciliationPanel` uses `canOverride={reconciliation.canSettle}`; a banner "Both teams scored this game and the scorebooks differ." when conflicts are unsettled. Dashboard: one banner row per pending settlement linking to the game.

- [ ] **Step 1: Write failing tests** — `should give the non-scoring team its batting from the paired book`, `should re-key translated events to the team's own game id`, `should leave normal games untouched`, dashboard: `should list a league game with unsettled differences`.
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/league-games src/lib/services/dashboard` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(league): show league results and stats to the team that didn't score`.

### Task 15: League home from league games

**Files:**
- Modify: `apps/web/src/lib/league-home/load.ts:326-372`, `apps/web/src/app/l/[slug]/_components/RecentUpcoming.tsx`, `apps/web/src/lib/league-home/__tests__/` (new test file `load-scheduled.test.ts`)

**Interfaces:**
- Produces: for `schedules_games` leagues, `recent` = the last 6 completed league games of the season and `upcoming` = the next 6 scheduled ones from now; each item `{ id; homeTeamId; homeName; awayTeamId; awayName; homeRuns?; awayRuns?; scheduledAt; timeZone }`, both team names linked with `teamHref`. `counters.games` = completed league games of the season (no division by two). Other leagues keep today's shapes and code path.

- [ ] **Step 1: Write failing tests** — `should list each league game once with both teams`, `should only list the selected season`, `should count completed league games without halving`.
- [ ] **Step 2: Run** `cd apps/web && npx jest src/lib/league-home` → FAIL.
- [ ] **Step 3: Implement**, rendering home/away rows in `RecentUpcoming` for the new shape.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(league-home): recent and upcoming from league games`.

---

## Phase D — Mobile

### Task 16: Placeholders, league-game columns and finalize rules on the phone

**Files:**
- Modify: `apps/mobile/src/db/schema.ts` (version 6; `opponent_players` + `linked_player_id`, `placeholder_game_id` (indexed), `is_fill_in`; `games` + `league_game_id`, `result_source`), `apps/mobile/src/db/migrations.ts` (`toVersion: 6` with `addColumns` for both tables), `apps/mobile/src/db/models/OpponentPlayer.ts`, `apps/mobile/src/db/models/Game.ts`, `apps/mobile/src/sync/sync-engine.ts` (`mapOpponentPlayer` :1780, `mapGame` :1695, push step 3b :1229, lifecycle skip :1563-1566, games pull apply), `apps/mobile/src/features/lineup/opponent-lineup.ts:109`, `apps/mobile/src/features/lineup/use-opponent-lineup.ts:25`, `apps/mobile/app/(tabs)/schedule/games/[gameId]/score.tsx` (:2352 roster filter, add-batter modal)
- Test: `apps/mobile/src/sync/__tests__/sync-engine.test.ts`, `apps/mobile/src/features/lineup/__tests__/league-placeholders.test.ts`

**Interfaces:**
- Produces:
  - `addNewOpponentBatter` gains `placeholderGameId?: string` and accepts an empty name (stored as first `''`, last `''`, shown as `#<jersey>` or `Batter <order>` via `opponentDisplayName`); the add-batter modal on a game with `leagueGameId` offers "Unknown player" (jersey optional) that passes `placeholderGameId = game.leagueGameId`.
  - `useOpponentLineup` hides roster rows whose `placeholderGameId` is set and differs from this game's `leagueGameId`, and rows with `isFillIn`.
  - Push 3b sends `placeholder_game_id` for new rows.
  - Lifecycle: finalize is skipped only when the server row is `completed`/`cancelled` **and** `result_source` is null.
  - Games pull: a pulled row with `result_source` set does not overwrite local `status`, scores or inning state of a local game that is `in_progress` or has unsynced events.
- Fix: the "ON THEIR ROSTER" list excludes players already in the batting order, not every roster player.

- [ ] **Step 1: Write failing tests:**
  - `should still finalize a game whose server row was completed from the paired book` (Review Focus 1).
  - `should not overwrite a local in-progress game with a paired result` (Review Focus 2).
  - `should push placeholder_game_id for an unknown player added during a league game`.
  - `should hide another game's placeholders from the roster picker`.
  - `should list roster players who are not yet batting under On their roster`.
- [ ] **Step 2: Run** `cd apps/mobile && pnpm jest src/sync src/features/lineup` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `pnpm --filter mobile type-check` → 0.
- [ ] **Step 5: Commit** `feat(mobile): unknown players and paired results for league games`.

### Task 17: The phone records the other team's pitcher

**Files:**
- Modify: `packages/shared/src/utils/due-batter.ts:134-160` (`attributePlayersForHalf`), `apps/mobile/app/(tabs)/schedule/games/[gameId]/score.tsx`, `apps/mobile/src/features/scoring/in-play-pitch.ts`
- Create: `apps/mobile/src/features/scoring/opponent-pitcher.ts`, `apps/mobile/src/features/scoring/__tests__/opponent-pitcher.test.ts`
- Test: `packages/shared/src/utils/__tests__/due-batter.test.ts`

**Interfaces:**
- Produces: `currentOpponentPitcherId(opponentSlots: { opponentPlayerRemoteId: string; startingPosition: string | null }[], events: GameEvent[]): string | null` — the opponent lineup's `P`, replaced by the latest pitching-change event with `isOpponentChange: true`. `attributePlayersForHalf` takes `opponentPitcherId` from it on our half. The scorer gets a "Change their pitcher" action (pick from the opponent roster or add an unknown player, same as Task 16) that appends the pitching-change event with `isOpponentChange: true` and the new `opponentPitcherId`.
- Without an opponent pitcher known, events are written as today (no key).

- [ ] **Step 1: Write failing tests** — `should use the opponent lineup's pitcher`, `should switch after an opponent pitching change`, `should write opponentPitcherId on our half-inning events` (due-batter).
- [ ] **Step 2: Run** `cd packages/shared && npx jest src/utils/__tests__/due-batter.test.ts` and `cd apps/mobile && pnpm jest src/features/scoring` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(mobile): record the other team's pitcher`.

---

## Phase E — Ship

### Task 18: Apply migrations, document, and shake down end to end

**Files:**
- Modify: `CLAUDE.md` (glossary: **LeagueGame**, **LeagueRosterRecord**, **Placeholder (league game)**, **ManualResult**, **SchedulesGames**; update **DualScorekeeper**, the **PlayerTransfer** "does not drive stat attribution" line, and the snapshot notes)

- [ ] **Step 0: Update `CLAUDE.md`** with the entries above, one paragraph each, naming the files from Tasks 1-17; commit `docs: league games in CLAUDE.md`.
- [ ] **Step 1: Ask the user to confirm the database target** (prod under SHAKEDOWN). Do not apply without a yes.
- [ ] **Step 2: Apply** `20261101000000`, `20261101000001`, `20261101000002` with MCP `apply_migration`; reconcile `schema_migrations.version` to the filename timestamps; regenerate types and diff against the hand-edited `supabase.ts` (expect no differences).
- [ ] **Step 3: Verify SQL behavior** on a SHAKEDOWN league with `schedules_games = true` and two teams (one league-managed):
  - adding a player to a team creates a linked `opponent_players` row in that team's roster record; transferring them deactivates it on the old record and creates one on the new;
  - a scorekeeper (not head coach) of the home team can insert a placeholder for the league game and an `opponent_game_lineups` row; a scorekeeper of an unrelated team cannot;
  - league staff can insert `game_events` on the home row and not on the away row.
- [ ] **Step 4: End-to-end:** create a league game on the web; score it on the iOS Simulator offline as the away team's scorekeeper with one unknown batter and a pitching change for the home team; sync; confirm the home team's row shows the final score, the league home shows one recent result, both teams' players appear on the stats page, and the placeholder appears in Unmatched players; match it and confirm the leaderboard updates. Then enter a hand result on a second game and confirm standings.
- [ ] **Step 5: Run** `pnpm test`, `pnpm type-check`, `pnpm lint` → all 0.
- [ ] **Step 6: Clean up SHAKEDOWN rows** per the seeding protocol; run `coderabbit review --agent --committed --base main -c CLAUDE.md` and address findings; commit fixes.
