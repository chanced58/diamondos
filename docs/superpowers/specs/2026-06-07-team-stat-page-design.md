# Team Stat Page — Design

**Date:** 2026-06-07
**Status:** Approved design, pending spec review
**Branch:** `team-stat-page`

## Problem

On the public league page (`/l/[slug]`), team names appear as plain text in several
places (standings, league leaders, spotlights, recent results). A visitor has no way
to drill into a single team. We want each team name to be a link to a new public
**team stat page** that shows the team's full record, team-level stats, and a complete
per-player stat breakdown.

## Goals

- A public team page at `/l/[slug]/team/[teamId]` showing the team's record, team-level
  stats, and full batting + pitching stat lines for every player on the roster.
- Every team-name occurrence on the league page links to that page.
- Honor FERPA/opt-out: players who opted out of public stats show a (masked) name with
  blanked stats for public viewers; signed-in viewers see everything.
- No database changes — reuse the existing snapshot tables.

## Non-Goals

- No new aggregation, RPC, or migration. The page is a filtered view of data already
  written to the snapshot tables.
- No editing/admin affordances — read-only public view.
- No team slugs — teams are addressed by their existing UUID.
- External/opponent "teams" (standings rows with `team_id IS NULL`) are not linkable and
  get no page; they aggregate multiple outside opponents and have no snapshot stats.

## Data Sources (all existing, keyed by `league_id` + `season` + `team_id`)

| Table | Provides |
|-------|----------|
| `league_standings_snapshot` | W/L/T, win_pct, runs_for, runs_against, division_id; all rows used to compute league rank |
| `league_team_stat_snapshot` | team-level `stats` JSON (Team AVG/ERA, Runs Scored, Run Diff) |
| `league_player_stat_snapshot` | per-player `stats` JSON, plate_appearances, innings_pitched_outs, public_opt_out, first/last name, team_name |
| `teams` | logo_url, primary/secondary color, name |
| `league_divisions` | division name for the team's division_id |

All four snapshot tables already carry `team_id`. The spotlight snapshot
(`league_spotlight_snapshot`) carries only `team_name` (no id), so spotlight links are
resolved via a `team_name → team_id` map built from standings.

## Architecture

### Route

`apps/web/src/app/l/[slug]/team/[teamId]/page.tsx`

- Public server component, `export const dynamic = 'force-dynamic'`.
- Accepts `searchParams.season` to stay in the league's season context.
- Wraps content in `league-scheme-${theme.colorScheme}` so it inherits league theming.
- Same visibility gate as the league home: a `signed_in` league shows the sign-in CTA,
  with `redirectTo` preserving the team URL.
- `generateMetadata` mirrors the league page (title `"{Team} — {League}"`, `noindex`
  for private leagues).

### Data loader

New module `apps/web/src/lib/league-home/team-load.ts` (keeps the already-large
`load.ts` focused on the league home). Exports:

```ts
getTeamStatPageData(slug, teamId, isAuthed, seasonParam?): Promise<TeamStatPageData>
```

`TeamStatPageData` is a discriminated union mirroring `LeagueHomeData`:
`{ notFound: true } | { blocked: true; league } | { ok: true; … }`.

Steps:
1. Look up league by slug (service-role client, same pattern as `getLeagueHomeData`).
   Missing → `notFound`. Visibility blocked → `blocked`.
2. Resolve season (`seasonParam ?? league.current_season ?? latest snapshot season`).
3. Parallel load (filtered by `league_id` + `season`):
   - all standings rows (for rank + this team's record + division_id),
   - this team's `league_team_stat_snapshot` row,
   - `league_player_stat_snapshot` rows where `team_id = teamId`,
   - `teams` row for `teamId` (name/logo/colors),
   - `league_divisions` for the division name.
4. If the team has **no** standings row, **no** team snapshot, and **no** player rows →
   `notFound` (team not part of this league/season).
5. Assemble the `ok` payload: team identity, record, rank, division name, team-stat
   list, batting rows, pitching rows.

### Pure helpers (unit-tested, co-located in `team-load.ts` or `@baseball/shared`)

- `computeTeamRank(standings, teamId): { rank, total }` — rank by win_pct among platform
  rows (`team_id` not null), 1-based; `total` = platform team count.
- `toTeamPlayerRows(snap, isAuthed)` — map player snapshot rows to display rows with
  name masking + opt-out handling (see below). Returns batting fields + pitching fields
  + an `optedOut` flag so the table can blank stat cells.

### Page composition (components under `l/[slug]/team/[teamId]/_components/`)

- **TeamHero** — logo + team name, back-link to `/l/[slug]?season=…`, season label,
  W-L-T, PCT, RF / RA / DIFF, division name, league rank ("3rd of 8"). Themed.
- **TeamStatPanel** — the team-group stats from the team snapshot as a labeled grid,
  using `STAT_CATALOG` defs with `subject === 'team'` and the shared `formatStat`.
- **TeamBattingTable** — every roster player; columns from batting `StatDef`s
  (AVG/OBP/SLG/OPS/HR/RBI/H/R/2B/3B/BB/QAB%/Hard-Hit%). Default sort by AVG desc
  (then PA desc) — server-sorted, no client interactivity required for v1.
- **TeamPitchingTable** — players with `innings_pitched_outs > 0`; IP + ERA/WHIP/K.

### Name masking + opt-out

- Authed viewers: `memberDisplayName`, all stats shown.
- Public viewers: `publicDisplayName`. For `public_opt_out` players, the row still
  renders (masked name) but every stat cell shows `—`.

> This intentionally diverges from the leaderboard rule (which *omits* opted-out players
> for public viewers): a roster reads as incomplete if players vanish, so we keep the
> name and blank the numbers.

## Making team names clickable (every occurrence)

A small helper `teamHref(slug, teamId, season)` → `/l/${slug}/team/${teamId}?season=…`.
`slug` and the active `season` are threaded from `page.tsx` into each component.

| Component | Change |
|-----------|--------|
| `StandingsTable` | Link `team_name` when `team_id` is present; null-id opponent rows stay plain. New props: `slug`, `season`. |
| `LeaderBoard` | Add optional `teamId` to the leader row; link the `· Team` tag when present. New props: `slug`, `season`. |
| `Spotlights` | Resolve `team_name → team_id` via a map from standings; link on match, plain text otherwise. New props: `slug`, `season`, `teamIdByName`. |
| `RecentUpcoming` | Add `team_id` to `RecentGame`; link the team name. New props: `slug`, `season`. |

### Shared-package change

`LeaderRow` and `RankedLeaderRow` in `@baseball/shared` gain an optional `teamId?: string`.
`buildLeaderboard` preserves it (spread through the ranking map). In `toLeaderRows`,
populate `teamId` from `r.team_id` (player snapshot); for team boards the row id is
already the `team_id`, so `board()` sets `teamId` accordingly.

### Refactor in service of the work

Extract `formatStat` from `LeaderBoard.tsx` into a shared module
(`apps/web/src/lib/league-home/format-stat.ts`) and import it in both `LeaderBoard` and
the new stat tables. No behavior change.

## Error handling & edge cases

- Team with a roster but no games → record `0-0-0`, rank still computed, tables render.
- `team_id` that isn't in this league/season → `notFound()`.
- Snapshot read failure → throw (page is the data), consistent with `getLeagueHomeData`.
- `teams` row missing (deleted team that still has snapshots) → fall back to the
  `team_name` carried on the snapshot rows; no logo.
- Spotlight team name with no standings match → plain text (no broken link).

## Testing

Unit tests (alongside existing `mapRecentGame` tests):
- `computeTeamRank` — ordering, ties, platform-only filtering, single team.
- `toTeamPlayerRows` — public masking, opt-out blanking, authed full view.
- `teamHref` — season encoding, omitted season.

## Out of scope / future

- Per-player drill-down pages.
- Client-side column sorting on the stat tables.
- Team logo upload (uses whatever `teams.logo_url` already holds).
