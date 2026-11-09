# League Stats Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/l/[slug]/stats` page listing every player's and team's season stats with league and team ranks, plus a "Your ranks" card for signed-in players and parents.

**Architecture:** A server loader reads the existing snapshot tables (service role), applies every privacy and "rankings off" rule, and precomputes all ranks with one shared ranking function that the home-page leader boards also switch to. The page renders a client component that only filters, sorts and displays what the loader sent.

**Tech Stack:** Next.js App Router (server components + `'use client'` islands), Supabase JS (service role), Tailwind with the app's design tokens, Jest + ts-jest (`@testing-library/react` + jsdom for component tests), pnpm/turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-11-08-league-stats-page-design.md`

## Global Constraints

- No migrations, new tables, columns or RPCs. Read only `leagues`, `league_standings_snapshot`, `league_player_stat_snapshot`, `league_team_stat_snapshot`, `league_divisions`, `players`, `parent_player_links`.
- Public viewers: names via `publicDisplayName`; opted-out players (`public_opt_out`) removed in the loader before anything is returned. Signed-in: `memberDisplayName`, everyone included.
- A `signed_in`-visibility league shows the same sign-in prompt as the home page to logged-out viewers; metadata `noindex` for `signed_in` leagues.
- `rankingEnabled` = the `leaders` section is enabled in `mergeWithThemeDefaults(league.home_theme).sections`. When false, the loader returns `ranks: null` and the UI shows no rank columns, no ranks in the card (titled "Your stats"), no "Needs N more" hints, no "Qualified only" switch.
- `standingsRankEnabled` = the `standings` section is enabled. When false, team rows carry `rank: null` and the Teams tab hides its # column.
- Batting tab lists players with PA > 0; Pitching tab lists players with IP outs > 0.
- Batting columns: PA then `TEAM_BATTING_KEYS`; default sort `avg`. Pitching columns: IP then `TEAM_PITCHING_KEYS`; default sort `era`.
- Card headline stats — Batting: `avg`, `obp`, `homeRuns`, `rbi`. Pitching: `era`, `whip`, `strikeoutsP`, IP.
- Ranks: competition ranking (1, 2, 2, 4), best-first by the stat's `sortDir`, ties displayed by name. League rank over all eligible players; team rank over eligible players on the same team; both over the unfiltered set.
- Qualification uses the same `leaderQualifierMinimums(leagueGames, leaderConfig.qualifierOverrides, league.level)` inputs as the home page.
- URL params: `?season=` (as home page), `?tab=batting|pitching|teams` (invalid/missing → `batting`).
- Copy: page title "League Stats"; metadata title `` `${league} — League Stats` ``; home links "Full league stats →" and footer "League stats"; card title "Your ranks" (ranking on) / "Your stats" (ranking off); hint "Needs N more PA" / "Needs X more IP" (X formatted as innings.thirds).
- Phone-first: table scrolls horizontally with rank + Player columns `sticky left-0`.

## Review Focus

1. **Public payload leak** — a public viewer of a league with an opted-out player: that player's name, stats, *and any rank or "of N" count influenced by them* must be absent from the serialized props. (Task 4 test: opted-out row absent from `players`, and `leagueOf` counts exclude it.)
2. **Season with no data / unknown `?season=`** — page renders empty states on every tab, no crash, card hidden. (Task 4 test.)
3. **Viewer linked to a player in a different league, or a parent with no linked players here** — no card, no highlight. (Task 4 test on `resolveMyPlayers`.)
4. **Rankings off but signed-in player** — card renders values only, no rank text, and `ranks` is `null` in the payload. (Tasks 4 and 6 tests.)
5. **Searching while "Qualified only" is on** — an unqualified player matching the search still appears, muted and unranked; the viewer's own unqualified row appears without searching. (Task 5 test.)

---

### Task 1: Shared ranking function (and home-page boards on top of it)

**Files:**
- Modify: `packages/shared/src/utils/league-leaderboard.ts`
- Modify: `apps/web/src/lib/league-home/load.ts` (`toLeaderRows`, team-board row mapping)
- Test: `packages/shared/src/utils/__tests__/league-leaderboard.test.ts`, `apps/web/src/lib/league-home/__tests__/load.test.ts`

**Interfaces:**
- Produces:
  - `LeaderRow` gains optional `activity?: number` — PA for batting/special stats, IP outs for pitching stats; omitted for team rows (always eligible).
  - `export function rankLeaderRows(rows: LeaderRow[], stat: Pick<StatDef,'sortDir'|'isRate'|'qualifier'>, minQualifier: number): RankedLeaderRow[]` — all eligible rows, ranked, no limit.
  - `buildLeaderboard(rows, stat, opts)` keeps its signature; becomes `rankLeaderRows(rows, stat, opts.minQualifier).slice(0, opts.limit)`.

- [ ] **Step 0: Install and baseline.** From the worktree root run `pnpm install` then `pnpm --filter @baseball/shared test && pnpm --filter web test`. Expected: all pass (record counts for the final report).
- [ ] **Step 1: Write failing tests** in `league-leaderboard.test.ts`:
  - `rankLeaderRows excludes rows with activity 0 even when minQualifier is 0` — ERA rows `[{id:'np', value:0, qualifierValue:0, activity:0}, {id:'p', value:3.5, qualifierValue:9, activity:9}]`, min 0 → ids `['p']`.
  - `rankLeaderRows breaks ties by name` — two rows value 0.35 named 'Zed' and 'Amy' → order `['Amy','Zed']`, both rank 1; next distinct value gets rank 3.
  - `rankLeaderRows keeps rows without activity (team rows)`.
  - `buildLeaderboard still respects limit and existing behaviour` (existing tests stay green).
- [ ] **Step 2: Run** `pnpm --filter @baseball/shared test -- league-leaderboard` → new tests FAIL (`rankLeaderRows` not exported).
- [ ] **Step 3: Implement** `rankLeaderRows` and rebuild `buildLeaderboard` on it. Eligibility: `(row.activity === undefined || row.activity > 0) && (!stat.isRate || stat.qualifier === 'none' || row.qualifierValue >= minQualifier)`. Sort by value per `sortDir`, then `name.localeCompare`.
- [ ] **Step 4: Write failing test** in `load.test.ts`: `toLeaderRows sets activity from innings_pitched_outs for pitching stats and plate_appearances otherwise` (`'era'` → activity = ip outs; `'strikeoutsP'` → ip outs; `'homeRuns'` → PA).
- [ ] **Step 5: Implement** in `toLeaderRows`: `activity: def.group === 'pitching' ? r.innings_pitched_outs : r.plate_appearances`. Team-board rows stay without `activity`.
- [ ] **Step 6: Run** both packages' tests → PASS.
- [ ] **Step 7: Commit** `feat(shared): add rankLeaderRows; exclude inactive players and stabilise ties on leader boards`.

### Task 2: Extract shared league-page helpers

**Files:**
- Create: `apps/web/src/lib/league-home/league-context.ts`
- Create: `apps/web/src/lib/league-home/stats-href.ts`
- Modify: `apps/web/src/lib/league-home/load.ts` (use the helpers; behaviour unchanged)
- Test: `apps/web/src/lib/league-home/__tests__/league-context.test.ts`

**Interfaces:**
- Produces:
  - `export function resolveSeason(seasonRows: Array<{season: string}>, currentSeason: string | null, seasonParam?: string): { season: string; seasons: string[] }` — same rule as `load.ts:274-277`.
  - `export function enabledSections(theme: ReturnType<typeof mergeWithThemeDefaults>): Set<SectionId>`
  - `export function qualifierMinsFor(platformStandings: Array<{wins:number;losses:number;ties:number}>, leaderConfigRaw: unknown, level: string | null): { paMin: number; ipOutsMin: number; leaderConfig: LeagueLeaderConfig }` — wraps the `leagueLeaderConfigSchema.safeParse` fallback + max-games computation now inline in `load.ts:266-314`.
  - `export function leagueStatsHref(slug: string, season?: string, tab?: 'batting'|'pitching'|'teams'): string` → `/l/${slug}/stats` with `season`/`tab` query params (encoded; omitted when absent).

- [ ] **Step 1: Write failing tests**: `resolveSeason` (param wins; else current; else newest; seasons sorted desc, deduped); `qualifierMinsFor` (malformed config → defaults; games = max W+L+T); `leagueStatsHref('my-league','2026 Spring','pitching')` → `/l/my-league/stats?season=2026%20Spring&tab=pitching`; `enabledSections` omits disabled ids.
- [ ] **Step 2: Run** `pnpm --filter web test -- league-context` → FAIL.
- [ ] **Step 3: Implement** the helpers; replace the inline code in `getLeagueHomeData` with calls to them.
- [ ] **Step 4: Run** `pnpm --filter web test -- league-home` → PASS (existing load tests unchanged).
- [ ] **Step 5: Commit** `refactor(web): extract league season/qualifier/section helpers`.

### Task 3: Rank tables for the stats page

**Files:**
- Create: `apps/web/src/lib/league-stats/columns.ts`
- Create: `apps/web/src/lib/league-stats/ranks.ts`
- Test: `apps/web/src/lib/league-stats/__tests__/ranks.test.ts`

**Interfaces:**
- Consumes: `rankLeaderRows` (Task 1), `getStatValue`, `TEAM_BATTING_KEYS`, `TEAM_PITCHING_KEYS`, `toStatColumns`/`SortColumnSpec` from `team-table-sort.ts`.
- Produces:
  - `export type StatsTab = 'batting' | 'pitching' | 'teams'`; `export function parseTab(v: string | undefined): StatsTab`.
  - `export const BATTING_COLUMNS: SortColumnSpec[]` (PA lead + `TEAM_BATTING_KEYS`), `PITCHING_COLUMNS` (IP lead + `TEAM_PITCHING_KEYS`); `export const CARD_KEYS: Record<'batting'|'pitching', string[]>` = `['avg','obp','homeRuns','rbi']` / `['era','whip','strikeoutsP','ip']`.
  - `export interface StatsPlayer { playerId: string; name: string; teamId: string; teamName: string; pa: number; ipOuts: number; stats: unknown; mine: boolean; ourTeam: boolean }`
  - `export interface RankCell { league: number | null; leagueOf: number; team: number | null; teamOf: number }` (`null` = not eligible/qualified).
  - `export type RankTable = Record<string /*column key*/, Record<string /*playerId*/, RankCell>>`
  - `export function computeRankTable(players: StatsPlayer[], columns: SortColumnSpec[], group: 'batting'|'pitching', mins: { paMin: number; ipOutsMin: number }): RankTable` — for each column builds `LeaderRow`s (`activity` = pa for batting, ipOuts for pitching; PA/IP lead columns rank as non-rate desc), calls `rankLeaderRows` once over all players and once per team.

- [ ] **Step 1: Write failing tests** (`ranks.test.ts`):
  - `ranks AVG league-wide and within team, excluding unqualified` — 4 batters (two on 'hawks'), paMin 10, one hawk at 5 PA → that hawk's cell `{league:null, team:null}`, others ranked; `leagueOf` 3, hawks `teamOf` 1.
  - `ERA ranks lower-is-better and ignores players with 0 IP` .
  - `counting stats (HR) rank everyone with PA > 0 regardless of paMin`.
  - `ties share a rank` (1, 1, 3).
  - `parseTab('nope')` → `'batting'`.
- [ ] **Step 2: Run** `pnpm --filter web test -- league-stats/__tests__/ranks` → FAIL.
- [ ] **Step 3: Implement** `columns.ts` and `ranks.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): league stats rank tables`.

### Task 4: League stats loader

**Files:**
- Create: `apps/web/src/lib/league-stats/load.ts` (`import 'server-only'`)
- Test: `apps/web/src/lib/league-stats/__tests__/load.test.ts`

**Interfaces:**
- Consumes: Task 2 helpers, Task 3 `computeRankTable`/`StatsPlayer`/`RankTable`, `resolveVisibility`, `publicDisplayName`, `memberDisplayName`, `ActiveTeamRef` from `league-home/load.ts`.
- Produces:
  - `export interface StatsTeam { teamId: string; name: string; wins: number; losses: number; ties: number; winPct: number; rank: number | null; stats: unknown }`
  - `export interface MyPlayer { playerId: string; name: string; teamName: string }`
  - `export type LeagueStatsData = { notFound: true } | { blocked: true; league: { name: string } } | { ok: true; slug: string; league: { id: string; name: string }; theme: ReturnType<typeof mergeWithThemeDefaults>; season: string; seasons: string[]; rankingEnabled: boolean; standingsRankEnabled: boolean; mins: { paMin: number; ipOutsMin: number }; players: StatsPlayer[]; ranks: { batting: RankTable; pitching: RankTable } | null; teams: StatsTeam[]; myPlayers: MyPlayer[] }`
  - Row types: `type PlayerSnapshotRow = Database['public']['Tables']['league_player_stat_snapshot']['Row']`, `type TeamSnapshotRow = Database['public']['Tables']['league_team_stat_snapshot']['Row']`; `StandingRow` from `league-home/load.ts`.
  - Pure, exported for tests: `export function assembleLeagueStats(input: AssembleInput): Extract<LeagueStatsData, {ok: true}>` where `AssembleInput` = `{ slug; league: {id; name; level: string|null; home_theme: unknown; leader_config: unknown}; season; seasons; isAuthed: boolean; standings: StandingRow[]; playerSnap: PlayerSnapshotRow[]; teamSnap: TeamSnapshotRow[]; myPlayerIds: Set<string>; activeTeam: ActiveTeamRef | null }`.
  - `export function resolveMyPlayerIds(ownPlayerIds: string[], childPlayerIds: string[], snapshotPlayerIds: Set<string>): string[]` — own first, then children, deduped, only ids in the snapshot.
  - `export async function getLeagueStatsData(slug: string, viewer: { userId: string | null; activeTeam: ActiveTeamRef | null }, seasonParam?: string): Promise<LeagueStatsData>` — IO only: league row, season rows, the three snapshot tables for the season, and (when `userId`) `players.select('id').eq('user_id', userId)` + `parent_player_links.select('player_id').eq('parent_user_id', userId)`; then `assembleLeagueStats`. Error handling mirrors `getLeagueHomeData` (league/snapshot errors throw; viewer lookups log and degrade to no card).

Rules inside `assembleLeagueStats`: drop opted-out rows when `!isAuthed` **before** ranking; `mine` = in `myPlayerIds`; `ourTeam` = `!mine && activeTeam?.id === teamId` and only when `myPlayerIds` is empty; `myPlayers` in `resolveMyPlayerIds` order; teams = platform standings rows joined to team snapshot by `team_id`, sorted by win pct, `rank` via `computeTeamRank` when `standingsRankEnabled`, else `null`; `ranks: null` when `!rankingEnabled`.

- [ ] **Step 1: Write failing tests** (`load.test.ts`), one per rule, including the Review Focus items:
  - `public viewers never receive opted-out players or counts influenced by them` (assert `players` lacks the id and every `leagueOf` equals visible eligible count).
  - `public names are masked, members see full names`.
  - `ranks is null when the leaders section is disabled` and `team rank is null when standings is disabled`.
  - `unknown season yields empty players/teams without throwing`.
  - `resolveMyPlayerIds keeps only ids present in this league's snapshot, own first`.
  - `ourTeam marks the active team only for non-player viewers`.
- [ ] **Step 2: Run** `pnpm --filter web test -- league-stats/__tests__/load` → FAIL.
- [ ] **Step 3: Implement** `load.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): league stats loader with privacy and ranking rules`.

### Task 5: Client filtering, sorting and card model

**Files:**
- Create: `apps/web/src/lib/league-stats/view.ts`
- Test: `apps/web/src/lib/league-stats/__tests__/view.test.ts`

**Interfaces:**
- Consumes: Task 3 types, `SortColumnSpec`, `getStatValue`, `formatStat`, `getStatDef`.
- Produces:
  - `export interface ViewState { teamId: string | 'all'; query: string; qualifiedOnly: boolean; sortKey: string; sortDir: 'asc' | 'desc' }`
  - `export function visiblePlayers(players: StatsPlayer[], tab: 'batting'|'pitching', state: ViewState, ranks: RankTable | null, selectedPlayerId: string | null): StatsPlayer[]` — tab activity filter (PA>0 / IP>0); team filter; case-insensitive substring `query` on name; `qualifiedOnly` applies only when `ranks` is non-null, `query` is empty, and the sorted column is a rate stat with a qualifier — and never removes `mine` rows or `selectedPlayerId`. Order: ranked rows by value in `sortDir` (name tiebreak), then unranked rows by name.
  - `export interface CardItem { label: string; display: string; rank: RankCell | null; needs: string | null }`
  - `export function cardItems(player: StatsPlayer, tab: 'batting'|'pitching', ranks: RankTable | null, mins: { paMin: number; ipOutsMin: number }): CardItem[]` — for `CARD_KEYS[tab]`; `rank` null when `ranks` null; `needs` only when ranks non-null and the stat is a rate stat the player hasn't qualified for: `Needs ${Math.ceil(paMin - pa)} more PA` or `Needs ${formatStat(Math.ceil(ipOutsMin - ipOuts), 'ip')} more IP`.

- [ ] **Step 1: Write failing tests**: `search shows unqualified matches even with qualifiedOnly on`; `qualifiedOnly hides unqualified rows but keeps the viewer's own row`; `qualifiedOnly is ignored when ranks are null`; `team filter applies to the viewer's own row too`; `unranked rows sort after ranked rows`; `cardItems shows "Needs 4 more PA" for an unqualified batter`; `cardItems returns no ranks or needs when ranking is off`.
- [ ] **Step 2: Run** `pnpm --filter web test -- league-stats/__tests__/view` → FAIL.
- [ ] **Step 3: Implement** `view.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): league stats filtering, sorting and card model`.

### Task 6: The `/l/[slug]/stats` page

**Files:**
- Create: `apps/web/src/app/l/[slug]/stats/page.tsx` (server)
- Create: `apps/web/src/app/l/[slug]/stats/_components/LeagueStatsView.tsx` (`'use client'`: tab, ViewState, selected card player; tab synced to `?tab=` with `router.replace(..., { scroll: false })`)
- Create: `.../_components/YourRanksCard.tsx`, `PlayerStatsTable.tsx`, `TeamStatsTable.tsx`, `FilterBar.tsx`
- Test: `apps/web/src/app/l/[slug]/stats/__tests__/stats-components.test.tsx` (`/** @jest-environment jsdom */`)

**Interfaces:**
- Consumes: `getLeagueStatsData` (Task 4), `visiblePlayers`/`cardItems` (Task 5), `BATTING_COLUMNS`/`PITCHING_COLUMNS`/`parseTab` (Task 3), `getActiveTeam`, `createServerClient`, `teamHref`, `formatStat`, `cellDisplay` pattern from `team-table-sort.ts`.
- Produces: `PlayerStatsTable({ players, columns, ranks, sortKey, sortDir, onSort, highlightId })`, `YourRanksCard({ myPlayers, players, tab, ranks, mins, selectedId, onSelect, teams, rankingEnabled })`.

Page behaviour: mirrors `app/l/[slug]/page.tsx` — `generateMetadata` via `getLeagueMeta` (title `` `${name} — League Stats` ``, noindex when `signed_in`); `notFound()`; blocked → same sign-in card with `redirectTo` = `encodeURIComponent(leagueStatsHref(slug, season, tab))`; `<main className={`league-scheme-${theme.colorScheme} mx-auto max-w-5xl space-y-6 p-4 md:p-8`}>`. Header: league name linking to `/l/${slug}?season=…`, "League Stats" h1, season switcher links to `leagueStatsHref(slug, s, tab)` (hidden with ≤1 season). Card renders only when `myPlayers.length > 0`; switcher only when > 1; Teams tab card shows the selected player's team record and (if `standingsRankEnabled`) "#N of M". Rank columns "Lg #" / "Team #" render only when `ranks` non-null; unranked cells show "—" and the row is muted (`text-app-fg-subtle`). Highlighted rows use the home page's ours styling (`bg-turf-50` + ◆ marker) for `mine`/selected, a lighter tint for `ourTeam`. Sticky: rank cells and Player cell `sticky left-0 z-10 bg-app-surface`. Clicking the card scrolls the selected row into view (`id={`row-${playerId}`}`). Empty states: "No batting stats yet for this season." / pitching / "No teams yet for this season.".

- [ ] **Step 1: Write failing component tests**: `PlayerStatsTable hides Lg #/Team # when ranks is null`; `PlayerStatsTable shows "—" ranks and muted style for an unqualified row`; `YourRanksCard titled "Your stats" with no "#" text when ranking is off`; `YourRanksCard shows a switcher only for more than one player`.
- [ ] **Step 2: Run** `pnpm --filter web test -- stats-components` → FAIL.
- [ ] **Step 3: Implement** the components and page.
- [ ] **Step 4: Run** → PASS; then `pnpm --filter web type-check` → no errors.
- [ ] **Step 5: Commit** `feat(web): public league stats page`.

### Task 7: Links to the stats page

**Files:**
- Modify: `apps/web/src/app/l/[slug]/page.tsx` (link under standings, footer link)
- Modify: `apps/web/src/app/l/[slug]/_components/LeadersSection.tsx` (header link; new `statsHref: string` prop)
- Modify: `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamHero.tsx` ("League stats" link next to the existing league link)

- [ ] **Step 1: Implement**: "Full league stats →" in the League Leaders header (right side, before/with tabs) and below the standings block, both `leagueStatsHref(slug, season)`; an always-rendered `<footer>` at the end of `<main>` with a "League stats" link (independent of section toggles); TeamHero link `leagueStatsHref(slug, season)`.
- [ ] **Step 2: Run** `pnpm --filter web type-check && pnpm --filter web lint` → clean.
- [ ] **Step 3: Commit** `feat(web): link league stats from home and team pages`.

### Task 8: Verify end to end

- [ ] **Step 1:** `pnpm --filter @baseball/shared test && pnpm --filter web test && pnpm --filter web type-check && pnpm --filter web lint` → all pass; compare counts with the Task 1 baseline.
- [ ] **Step 2:** Run the web dev server and open `/l/<a seeded public league slug>/stats` at desktop and 375px widths: tabs, sorting, team filter, search, sticky columns, season switcher, links from home/team pages. Signed out: masked names, no card. If a signed-in test account linked to a player exists in the local seed, check the card; otherwise note it as unverified.
- [ ] **Step 3:** Set the league's `leaders` section off (local DB only) and confirm no rank columns/card ranks and no ranks in the page's serialized props.
