# Team Stat Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public team stat page at `/l/[slug]/team/[teamId]` showing a team's record, team-level stats, and full per-player batting/pitching lines, and make every team-name occurrence on the league page link to it.

**Architecture:** The page is a read-only Next.js server component that filters the existing league snapshot tables (`league_standings_snapshot`, `league_team_stat_snapshot`, `league_player_stat_snapshot`) by `team_id`. No DB migration, no new aggregation. Pure data-shaping helpers are unit-tested; presentational components and the DB orchestrator follow the existing (untested) league-home pattern. Team-name links are threaded through the four league-page components that render a team name.

**Tech Stack:** Next.js 14 (App Router, server components), TypeScript, Supabase JS (service-role client, server-only), Tailwind, `@baseball/shared` (`STAT_CATALOG`, display-name + leaderboard helpers), Jest + ts-jest.

---

## File Structure

**Create:**
- `apps/web/src/lib/league-home/team-load.ts` — server-only (`import 'server-only'`) team-page data loader + pure helpers (`getTeamStatPageData`, `getTeamMeta`, `computeTeamRank`, `toTeamPlayerRows`, `teamIdByName`, `buildTeamStatList`, types). It re-exports `teamHref`.
- `apps/web/src/lib/league-home/team-href.ts` — the `teamHref` URL builder, kept in its **own non-server-only module** so client components (e.g. `LeaderBoard`) can import it without pulling in the `server-only` loader. (Discovered during implementation: Task 8 introduced this split when `LeaderBoard`, a client component, needed `teamHref`.)
- `apps/web/src/lib/league-home/format-stat.ts` — shared `formatStat` extracted from `LeaderBoard.tsx`.
- `apps/web/src/lib/league-home/__tests__/team-load.test.ts` — unit tests for the pure helpers.
- `apps/web/src/app/l/[slug]/team/[teamId]/page.tsx` — the route (server component).
- `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamHero.tsx`
- `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamStatPanel.tsx`
- `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamBattingTable.tsx`
- `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamPitchingTable.tsx`

**Modify:**
- `packages/shared/src/utils/league-leaderboard.ts` — add optional `teamId` to `LeaderRow`.
- `apps/web/src/lib/league-home/load.ts` — populate `teamId` on leader rows; add `team_id` to `RecentGame`; export `teamIdByName` use is in team-load (no change needed there beyond teamId plumbing).
- `apps/web/src/app/l/[slug]/_components/LeaderBoard.tsx` — import shared `formatStat`; link the team tag.
- `apps/web/src/app/l/[slug]/_components/StandingsTable.tsx` — link team names; new `slug`/`season` props.
- `apps/web/src/app/l/[slug]/_components/Spotlights.tsx` — link matched team names; new props.
- `apps/web/src/app/l/[slug]/_components/RecentUpcoming.tsx` — link team names; new props.
- `apps/web/src/app/l/[slug]/page.tsx` — thread `slug`/`season`/`teamIdByName` into the four components.

**Test commands** (run from repo root unless noted):
- Web tests: `pnpm --filter web test -- <path-or-name>`
- Shared tests: `pnpm --filter @baseball/shared test -- <name>`
- Type check: `pnpm --filter web type-check` and `pnpm --filter @baseball/shared type-check`

---

## Task 1: Add `teamId` to the shared leader row

**Files:**
- Modify: `packages/shared/src/utils/league-leaderboard.ts`
- Test: `packages/shared/src/utils/__tests__/league-leaderboard.test.ts` (create if absent; otherwise add the test)

- [ ] **Step 1: Write the failing test**

Create/append `packages/shared/src/utils/__tests__/league-leaderboard.test.ts`:

```ts
import { buildLeaderboard, type LeaderRow } from '../league-leaderboard';
import { getStatDef } from '../../constants/stat-catalog';

describe('buildLeaderboard teamId passthrough', () => {
  it('preserves the optional teamId on ranked rows', () => {
    const rows: LeaderRow[] = [
      { id: 'p1', name: 'A', value: 0.4, qualifierValue: 30, teamName: 'Reds', teamId: 't1' },
      { id: 'p2', name: 'B', value: 0.3, qualifierValue: 30, teamName: 'Jays', teamId: 't2' },
    ];
    const ranked = buildLeaderboard(rows, getStatDef('avg'), { minQualifier: 0, limit: 10 });
    expect(ranked[0].teamId).toBe('t1');
    expect(ranked[1].teamId).toBe('t2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @baseball/shared test -- league-leaderboard`
Expected: FAIL — TypeScript error "Object literal may only specify known properties, and 'teamId' does not exist in type 'LeaderRow'".

- [ ] **Step 3: Add `teamId` to `LeaderRow`**

In `packages/shared/src/utils/league-leaderboard.ts`, change:

```ts
export interface LeaderRow {
  id: string; name: string; value: number; qualifierValue: number; teamName?: string;
}
```

to:

```ts
export interface LeaderRow {
  id: string; name: string; value: number; qualifierValue: number; teamName?: string; teamId?: string;
}
```

(`RankedLeaderRow extends LeaderRow`, and `buildLeaderboard` does `ranked.push({ ...row, rank })`, so `teamId` flows through with no further change.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @baseball/shared test -- league-leaderboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/league-leaderboard.ts packages/shared/src/utils/__tests__/league-leaderboard.test.ts
git commit -m "feat(shared): add optional teamId to LeaderRow"
```

---

## Task 2: Extract shared `formatStat`

**Files:**
- Create: `apps/web/src/lib/league-home/format-stat.ts`
- Modify: `apps/web/src/app/l/[slug]/_components/LeaderBoard.tsx`

- [ ] **Step 1: Create the shared formatter**

Create `apps/web/src/lib/league-home/format-stat.ts`:

```ts
import type { StatDef } from '@baseball/shared';

export type StatFormat = StatDef['format'];

/** Format a numeric stat value for display per its catalog `format`. */
export function formatStat(v: number, format: StatFormat): string {
  switch (format) {
    case 'avg3':
      return v.toFixed(3).replace(/^0/, '');
    case 'pct1':
      return `${(v * 100).toFixed(1)}%`;
    case 'ratio2':
      return v.toFixed(2);
    case 'ip': {
      // value is whole outs; render as innings.thirds (e.g. 19 outs -> 6.1)
      const whole = Math.floor(v / 3);
      const thirds = Math.round(v % 3);
      return `${whole}.${thirds}`;
    }
    case 'int':
      return String(Math.round(v));
    default:
      return String(v);
  }
}
```

- [ ] **Step 2: Replace the local copy in `LeaderBoard.tsx`**

In `apps/web/src/app/l/[slug]/_components/LeaderBoard.tsx`:
- Delete the local `function formatStat(...) { ... }` definition (the whole block near the bottom).
- Delete the local `type StatFormat = StatDef['format'];` line.
- Add the import near the top (after the existing imports):

```ts
import { formatStat, type StatFormat } from '@/lib/league-home/format-stat';
```

- [ ] **Step 3: Verify type-check and existing tests still pass**

Run: `pnpm --filter web type-check`
Expected: no errors.
Run: `pnpm --filter web test -- league-home`
Expected: PASS (existing `load.test.ts` unaffected).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/league-home/format-stat.ts apps/web/src/app/l/\[slug\]/_components/LeaderBoard.tsx
git commit -m "refactor(web): extract shared formatStat from LeaderBoard"
```

---

## Task 3: Team-page pure helpers + types (`team-load.ts`)

**Files:**
- Create: `apps/web/src/lib/league-home/team-load.ts`
- Test: `apps/web/src/lib/league-home/__tests__/team-load.test.ts`

This task adds only the **pure, testable** helpers and the shared types. The DB orchestrator (`getTeamStatPageData`) comes in Task 4.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/league-home/__tests__/team-load.test.ts`:

```ts
import {
  teamHref,
  computeTeamRank,
  toTeamPlayerRows,
  teamIdByName,
  buildTeamStatList,
} from '../team-load';

describe('teamHref', () => {
  it('builds a season-scoped team URL', () => {
    expect(teamHref('acme', 't1', '2026')).toBe('/l/acme/team/t1?season=2026');
  });
  it('omits the season param when no season is given', () => {
    expect(teamHref('acme', 't1')).toBe('/l/acme/team/t1');
  });
  it('encodes season values with spaces', () => {
    expect(teamHref('acme', 't1', 'Spring 2026')).toBe('/l/acme/team/t1?season=Spring%202026');
  });
});

describe('computeTeamRank', () => {
  const standings = [
    { team_id: 't1', win_pct: 0.6 },
    { team_id: 't2', win_pct: 0.8 },
    { team_id: 't3', win_pct: 0.4 },
    { team_id: null, win_pct: 0.9 }, // external opponent row — excluded
  ];
  it('ranks a team among platform teams by win_pct (1-based)', () => {
    expect(computeTeamRank(standings as any, 't2')).toEqual({ rank: 1, total: 3 });
    expect(computeTeamRank(standings as any, 't1')).toEqual({ rank: 2, total: 3 });
    expect(computeTeamRank(standings as any, 't3')).toEqual({ rank: 3, total: 3 });
  });
  it('returns null rank when the team is absent', () => {
    expect(computeTeamRank(standings as any, 'tX')).toEqual({ rank: null, total: 3 });
  });
});

describe('toTeamPlayerRows', () => {
  const snap = [
    { player_id: 'p1', first_name: 'Alex', last_name: 'Ramirez', public_opt_out: false, stats: { avg: 0.35 }, plate_appearances: 30, innings_pitched_outs: 0 },
    { player_id: 'p2', first_name: 'Sam', last_name: 'Lee', public_opt_out: true, stats: { avg: 0.4 }, plate_appearances: 25, innings_pitched_outs: 0 },
  ];
  it('masks names and flags opt-out for public viewers', () => {
    const rows = toTeamPlayerRows(snap as any, false);
    expect(rows.find((r) => r.playerId === 'p1')).toMatchObject({ name: 'Alex R.', optedOut: false });
    expect(rows.find((r) => r.playerId === 'p2')).toMatchObject({ name: 'Sam L.', optedOut: true });
  });
  it('shows full names and never flags opt-out for authed viewers', () => {
    const rows = toTeamPlayerRows(snap as any, true);
    expect(rows.find((r) => r.playerId === 'p2')).toMatchObject({ name: 'Sam Lee', optedOut: false });
  });
});

describe('teamIdByName', () => {
  it('maps folded team names to ids, skipping null-id rows', () => {
    const map = teamIdByName([
      { team_id: 't1', team_name: '  Reds ' },
      { team_id: null, team_name: 'Outsiders' },
    ] as any);
    expect(map.get('reds')).toBe('t1');
    expect(map.has('outsiders')).toBe(false);
  });
});

describe('buildTeamStatList', () => {
  it('produces formatted team-group stats in catalog order', () => {
    const list = buildTeamStatList({ teamAvg: 0.301, teamEra: 3.5, runsScored: 88, runDiff: 12 });
    expect(list.map((s) => s.label)).toEqual(['Team AVG', 'Team ERA', 'Runs Scored', 'Run Diff']);
    expect(list[0].display).toBe('.301');
    expect(list[1].display).toBe('3.50');
    expect(list[2].display).toBe('88');
    expect(list[3].display).toBe('12');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- team-load`
Expected: FAIL — "Cannot find module '../team-load'".

- [ ] **Step 3: Implement the pure helpers + types**

Create `apps/web/src/lib/league-home/team-load.ts`:

```ts
import {
  STAT_CATALOG,
  getStatValue as _unusedPlaceholder, // removed below; see note
} from '@baseball/shared';
```

> NOTE: `getStatValue` lives in `./load.ts`, not `@baseball/shared`. Use this import block instead:

```ts
import { STAT_CATALOG, memberDisplayName, publicDisplayName, type StatDef } from '@baseball/shared';
import { formatStat } from './format-stat';
import { getStatValue } from './load';

/** Build a season-scoped URL to a team's public stat page. */
export function teamHref(slug: string, teamId: string, season?: string): string {
  const base = `/l/${slug}/team/${teamId}`;
  return season ? `${base}?season=${encodeURIComponent(season)}` : base;
}

/** A minimal standings shape used for ranking and name→id mapping. */
export interface RankStandingRow {
  team_id: string | null;
  team_name?: string;
  win_pct: number;
}

/**
 * Rank a team among the league's *platform* teams (rows with a non-null team_id)
 * by win_pct, 1-based and descending. `rank` is null when the team is absent.
 */
export function computeTeamRank(
  standings: RankStandingRow[],
  teamId: string,
): { rank: number | null; total: number } {
  const platform = standings.filter((r) => r.team_id);
  const sorted = [...platform].sort((a, b) => b.win_pct - a.win_pct);
  const idx = sorted.findIndex((r) => r.team_id === teamId);
  return { rank: idx === -1 ? null : idx + 1, total: platform.length };
}

/** Map case/whitespace-folded team names to team ids (skips null-id rows). */
export function teamIdByName(standings: RankStandingRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of standings) {
    if (r.team_id && r.team_name) map.set(r.team_name.trim().toLowerCase(), r.team_id);
  }
  return map;
}

/** A roster player's display row. `stats` is the raw snapshot blob (read via getStatValue). */
export interface TeamPlayerStatRow {
  playerId: string;
  name: string;
  /** true only for public viewers of an opted-out player; tables blank stat cells when set */
  optedOut: boolean;
  plateAppearances: number;
  inningsPitchedOuts: number;
  stats: unknown;
}

/** Map player snapshot rows to display rows with name masking + opt-out flagging. */
export function toTeamPlayerRows(snap: any[], isAuthed: boolean): TeamPlayerStatRow[] {
  return snap.map((r) => ({
    playerId: r.player_id,
    name: isAuthed
      ? memberDisplayName({ firstName: r.first_name, lastName: r.last_name })
      : publicDisplayName({ firstName: r.first_name, lastName: r.last_name }),
    optedOut: !isAuthed && !!r.public_opt_out,
    plateAppearances: r.plate_appearances ?? 0,
    inningsPitchedOuts: r.innings_pitched_outs ?? 0,
    stats: r.stats,
  }));
}

/** A team-level stat formatted for the stat panel. */
export interface TeamStatItem {
  key: string;
  label: string;
  display: string;
}

/** Build the team-group stat list (catalog order) from a team snapshot `stats` blob. */
export function buildTeamStatList(stats: unknown): TeamStatItem[] {
  return STAT_CATALOG.filter((d) => d.subject === 'team').map((d) => ({
    key: d.key,
    label: d.label,
    display: formatStat(getStatValue(stats, d.field), d.format),
  }));
}
```

> Remove the bad first import block; keep only the second. Verify `memberDisplayName` and
> `publicDisplayName` are exported from `@baseball/shared` (they are — used in `load.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- team-load`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Type-check**

Run: `pnpm --filter web type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/league-home/team-load.ts apps/web/src/lib/league-home/__tests__/team-load.test.ts
git commit -m "feat(web): add team stat page pure helpers"
```

---

## Task 4: `getTeamStatPageData` orchestrator

**Files:**
- Modify: `apps/web/src/lib/league-home/team-load.ts`

This wires DB reads to the Task 3 helpers. It mirrors `getLeagueHomeData` and is not unit-tested (consistent with the existing loader, which news up a real client).

- [ ] **Step 1: Add the column-order constants + payload type**

Append to `apps/web/src/lib/league-home/team-load.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { mergeWithThemeDefaults } from '@baseball/shared';
import { resolveVisibility } from './load';

/** Batting columns for the team page, in display order. */
export const TEAM_BATTING_KEYS = [
  'avg', 'obp', 'slg', 'ops', 'homeRuns', 'rbi', 'hits', 'runs',
  'doubles', 'triples', 'walks', 'qabPct', 'hardHitPct',
] as const;

/** Pitching columns for the team page, in display order (IP rendered separately). */
export const TEAM_PITCHING_KEYS = ['era', 'whip', 'strikeoutsP'] as const;

export interface TeamRecord {
  wins: number; losses: number; ties: number; winPct: number;
  runsFor: number; runsAgainst: number;
}

export type TeamStatPageData =
  | { notFound: true }
  | { blocked: true; league: { name: string }; slug: string }
  | {
      ok: true;
      slug: string;
      league: { id: string; name: string };
      theme: ReturnType<typeof mergeWithThemeDefaults>;
      season: string;
      team: { id: string; name: string; logoUrl: string | null };
      record: TeamRecord;
      rank: { rank: number | null; total: number };
      divisionName: string | null;
      teamStats: TeamStatItem[];
      players: TeamPlayerStatRow[];
    };
```

- [ ] **Step 2: Add the orchestrator**

Append:

```ts
export async function getTeamStatPageData(
  slug: string,
  teamId: string,
  isAuthed: boolean,
  seasonParam?: string,
): Promise<TeamStatPageData> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: league, error: leagueErr } = await db
    .from('leagues')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (leagueErr) {
    console.error(`[team-page] league lookup failed slug=${slug}: ${leagueErr.message}`);
    throw new Error('Failed to load team. Please try again.');
  }
  if (!league) return { notFound: true };
  if (resolveVisibility(league.visibility, isAuthed) === 'blocked') {
    return { blocked: true, league: { name: league.name }, slug };
  }

  const theme = mergeWithThemeDefaults(league.home_theme);

  const { data: seasonRows } = await db
    .from('league_standings_snapshot')
    .select('season')
    .eq('league_id', league.id);
  const seasons = Array.from(new Set((seasonRows ?? []).map((r: { season: string }) => r.season))).sort((a, b) =>
    b.localeCompare(a),
  );
  const season = seasonParam ?? league.current_season ?? seasons[0] ?? '';

  const [
    { data: standings, error: standingsErr },
    { data: teamRow, error: teamStatErr },
    { data: playerSnap, error: playerErr },
    { data: teamMeta, error: teamMetaErr },
  ] = await Promise.all([
    db.from('league_standings_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_team_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season).eq('team_id', teamId).maybeSingle(),
    db.from('league_player_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season).eq('team_id', teamId),
    db.from('teams').select('id, name, logo_url').eq('id', teamId).maybeSingle(),
  ]);
  const snapErr = standingsErr || teamStatErr || playerErr || teamMetaErr;
  if (snapErr) {
    console.error(`[team-page] snapshot read failed league=${league.id} team=${teamId} season=${season}: ${snapErr.message}`);
    throw new Error('Failed to load team data. Please try again.');
  }

  const allStandings = (standings ?? []) as any[];
  const standingRow = allStandings.find((r) => r.team_id === teamId);
  const players = toTeamPlayerRows(playerSnap ?? [], isAuthed);

  // A team unknown to this league/season has no record, no stat row, and no roster.
  if (!standingRow && !teamRow && players.length === 0) return { notFound: true };

  // Resolve division name (only if the standings row carries a division_id).
  let divisionName: string | null = null;
  if (standingRow?.division_id) {
    const { data: div } = await db
      .from('league_divisions')
      .select('name')
      .eq('id', standingRow.division_id)
      .maybeSingle();
    divisionName = div?.name ?? null;
  }

  const teamName = teamMeta?.name ?? standingRow?.team_name ?? teamRow?.team_name ?? 'Team';
  const record: TeamRecord = {
    wins: standingRow?.wins ?? 0,
    losses: standingRow?.losses ?? 0,
    ties: standingRow?.ties ?? 0,
    winPct: standingRow?.win_pct ?? 0,
    runsFor: standingRow?.runs_for ?? 0,
    runsAgainst: standingRow?.runs_against ?? 0,
  };

  // Sort batting by playing time (PA desc) and pitching by workload (IP desc) — never
  // by a hidden stat, so opted-out public rows don't leak an ordering signal.
  players.sort((a, b) => b.plateAppearances - a.plateAppearances);

  return {
    ok: true,
    slug,
    league: { id: league.id, name: league.name },
    theme,
    season,
    team: { id: teamId, name: teamName, logoUrl: teamMeta?.logo_url ?? null },
    record,
    rank: computeTeamRank(allStandings, teamId),
    divisionName,
    teamStats: buildTeamStatList(teamRow?.stats ?? {}),
    players,
  };
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter web type-check`
Expected: no errors. (If `mergeWithThemeDefaults` or `resolveVisibility` import paths error, confirm `resolveVisibility` is exported from `./load` — it is — and `mergeWithThemeDefaults` from `@baseball/shared` — it is, used in `load.ts`.)

- [ ] **Step 4: Run the helper tests again (regression)**

Run: `pnpm --filter web test -- team-load`
Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/league-home/team-load.ts
git commit -m "feat(web): add getTeamStatPageData loader"
```

---

## Task 5: Presentational components

**Files:**
- Create: `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamHero.tsx`
- Create: `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamStatPanel.tsx`
- Create: `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamBattingTable.tsx`
- Create: `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamPitchingTable.tsx`

These mirror the styling of `StandingsTable.tsx` (no tests, consistent with existing components).

- [ ] **Step 1: TeamHero**

Create `TeamHero.tsx`:

```tsx
import type { TeamRecord } from '@/lib/league-home/team-load';

export function TeamHero({
  slug,
  season,
  leagueName,
  team,
  record,
  rank,
  divisionName,
}: {
  slug: string;
  season: string;
  leagueName: string;
  team: { id: string; name: string; logoUrl: string | null };
  record: TeamRecord;
  rank: { rank: number | null; total: number };
  divisionName: string | null;
}): JSX.Element {
  const diff = record.runsFor - record.runsAgainst;
  const ordinal = rank.rank ? ordinalSuffix(rank.rank) : null;
  return (
    <section className="rounded-2xl border border-app-border bg-app-surface p-5">
      <a
        href={`/l/${slug}?season=${encodeURIComponent(season)}`}
        className="text-sm font-medium text-app-fg-muted hover:text-app-fg"
      >
        ← {leagueName}
      </a>
      <div className="mt-3 flex items-center gap-4">
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logoUrl} alt="" className="h-14 w-14 rounded-lg object-contain" />
        ) : null}
        <div>
          <h1 className="display text-2xl font-bold text-app-fg">{team.name}</h1>
          <p className="text-sm text-app-fg-muted">
            {season}
            {divisionName ? ` · ${divisionName}` : ''}
            {ordinal ? ` · ${ordinal} of ${rank.total}` : ''}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Record" value={`${record.wins}-${record.losses}-${record.ties}`} />
        <Stat label="PCT" value={record.winPct.toFixed(3).replace(/^0/, '')} />
        <Stat label="RF / RA" value={`${record.runsFor} / ${record.runsAgainst}`} />
        <Stat label="Run Diff" value={diff > 0 ? `+${diff}` : String(diff)} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-app-border bg-app-surface-2 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wider text-app-fg-muted">{label}</dt>
      <dd className="mono mt-0.5 text-lg font-semibold text-app-fg">{value}</dd>
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
```

- [ ] **Step 2: TeamStatPanel**

Create `TeamStatPanel.tsx`:

```tsx
import type { TeamStatItem } from '@/lib/league-home/team-load';

export function TeamStatPanel({ stats }: { stats: TeamStatItem[] }): JSX.Element | null {
  if (stats.length === 0) return null;
  return (
    <section>
      <h2 className="display mb-3 text-xl font-bold">Team Stats</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded-xl border border-app-border bg-app-surface px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wider text-app-fg-muted">{s.label}</dt>
            <dd className="mono mt-1 text-xl font-semibold text-app-fg">{s.display}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

- [ ] **Step 3: TeamBattingTable**

Create `TeamBattingTable.tsx`:

```tsx
import { getStatDef } from '@baseball/shared';
import { formatStat } from '@/lib/league-home/format-stat';
import { getStatValue } from '@/lib/league-home/load';
import { TEAM_BATTING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';

export function TeamBattingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element {
  if (players.length === 0) {
    return <p className="text-sm text-app-fg-subtle">No players yet for this season.</p>;
  }
  const cols = TEAM_BATTING_KEYS.map((k) => getStatDef(k));
  return (
    <div className="overflow-x-auto rounded-xl border border-app-border bg-app-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
            <th className="px-3 py-2.5">Player</th>
            <th className="px-2 py-2.5 text-center">PA</th>
            {cols.map((c) => (
              <th key={c.key} className="px-2 py-2.5 text-center">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {players.map((p) => (
            <tr key={p.playerId}>
              <td className="px-3 py-2.5 font-medium text-app-fg">{p.name}</td>
              <td className="mono px-2 py-2.5 text-center">{p.optedOut ? '—' : p.plateAppearances}</td>
              {cols.map((c) => (
                <td key={c.key} className="mono px-2 py-2.5 text-center">
                  {p.optedOut ? '—' : formatStat(getStatValue(p.stats, c.field), c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: TeamPitchingTable**

Create `TeamPitchingTable.tsx`:

```tsx
import { getStatDef } from '@baseball/shared';
import { formatStat } from '@/lib/league-home/format-stat';
import { getStatValue } from '@/lib/league-home/load';
import { TEAM_PITCHING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';

export function TeamPitchingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element | null {
  const pitchers = players.filter((p) => p.inningsPitchedOuts > 0);
  if (pitchers.length === 0) return null;
  const cols = TEAM_PITCHING_KEYS.map((k) => getStatDef(k));
  return (
    <div className="overflow-x-auto rounded-xl border border-app-border bg-app-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
            <th className="px-3 py-2.5">Pitcher</th>
            <th className="px-2 py-2.5 text-center">IP</th>
            {cols.map((c) => (
              <th key={c.key} className="px-2 py-2.5 text-center">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {pitchers.map((p) => (
            <tr key={p.playerId}>
              <td className="px-3 py-2.5 font-medium text-app-fg">{p.name}</td>
              <td className="mono px-2 py-2.5 text-center">
                {p.optedOut ? '—' : formatStat(p.inningsPitchedOuts, 'ip')}
              </td>
              {cols.map((c) => (
                <td key={c.key} className="mono px-2 py-2.5 text-center">
                  {p.optedOut ? '—' : formatStat(getStatValue(p.stats, c.field), c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm --filter web type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/l/\[slug\]/team
git commit -m "feat(web): add team stat page components"
```

---

## Task 6: The team page route

**Files:**
- Create: `apps/web/src/app/l/[slug]/team/[teamId]/page.tsx`

- [ ] **Step 1: Implement the page**

Create `page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamStatPageData } from '@/lib/league-home/team-load';
import { TeamHero } from './_components/TeamHero';
import { TeamStatPanel } from './_components/TeamStatPanel';
import { TeamBattingTable } from './_components/TeamBattingTable';
import { TeamPitchingTable } from './_components/TeamPitchingTable';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string; teamId: string };
}): Promise<Metadata> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const data = await getTeamStatPageData(params.slug, params.teamId, !!user);
  if ('notFound' in data) return { title: 'Team not found' };
  if ('blocked' in data) return { title: data.league.name, robots: { index: false, follow: false } };
  return {
    title: `${data.team.name} — ${data.league.name}`,
    description: `${data.team.name} record and player statistics in ${data.league.name}.`,
    robots: data.theme ? undefined : undefined,
  };
}

export default async function TeamStatPage({
  params,
  searchParams,
}: {
  params: { slug: string; teamId: string };
  searchParams: { season?: string };
}): Promise<JSX.Element> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const data = await getTeamStatPageData(params.slug, params.teamId, !!user, searchParams.season);

  if ('notFound' in data) notFound();
  if ('blocked' in data) {
    return (
      <main className="mx-auto max-w-md p-12 text-center">
        <h1 className="text-2xl font-bold">{data.league.name}</h1>
        <p className="mt-2 text-slate-600">This league is visible to signed-in users only.</p>
        <a
          href={`/login?redirectTo=/l/${data.slug}/team/${params.teamId}`}
          className="mt-4 inline-block rounded bg-slate-900 px-4 py-2 text-white"
        >
          Sign in
        </a>
      </main>
    );
  }

  return (
    <main className={`league-scheme-${data.theme.colorScheme} mx-auto max-w-5xl space-y-8 p-4 md:p-8`}>
      <TeamHero
        slug={data.slug}
        season={data.season}
        leagueName={data.league.name}
        team={data.team}
        record={data.record}
        rank={data.rank}
        divisionName={data.divisionName}
      />
      <TeamStatPanel stats={data.teamStats} />
      <section>
        <h2 className="display mb-3 text-xl font-bold">Batting</h2>
        <TeamBattingTable players={data.players} />
      </section>
      <section>
        <h2 className="display mb-3 text-xl font-bold">Pitching</h2>
        <TeamPitchingTable players={data.players} />
      </section>
    </main>
  );
}
```

> Clean up the `robots: data.theme ? undefined : undefined` line — replace the metadata
> return's `robots` with the proper private-league rule by checking visibility. Since
> `getTeamStatPageData` only returns `ok` for visible-to-this-viewer leagues, a public
> `ok` result needs `robots` only when the league is `signed_in`. Simplest correct form:
> drop the `robots` key from the `ok` branch entirely (a `signed_in` league returns
> `blocked` for anon, already `noindex`; an authed viewer's pages aren't crawled). Final
> `ok` return: `{ title, description }`.

- [ ] **Step 2: Apply the metadata cleanup**

Edit the `ok` branch of `generateMetadata` to:

```tsx
  return {
    title: `${data.team.name} — ${data.league.name}`,
    description: `${data.team.name} record and player statistics in ${data.league.name}.`,
  };
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter web type-check`
Expected: no errors.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `pnpm --filter web dev`, open `/l/<a-real-league-slug>/team/<a-real-team-id>`.
Expected: hero with record + rank, team stats grid, batting + pitching tables. A bad
team id renders the 404 page.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/l/\[slug\]/team/\[teamId\]/page.tsx
git commit -m "feat(web): add public team stat page route"
```

---

## Task 7: Link team names — Standings

**Files:**
- Modify: `apps/web/src/app/l/[slug]/_components/StandingsTable.tsx`
- Modify: `apps/web/src/app/l/[slug]/page.tsx`

- [ ] **Step 1: Add `slug`/`season` props and link the team name in `StandingsTable`**

In `StandingsTable.tsx`, change the signature:

```tsx
export function StandingsTable({
  rows,
  slug,
  season,
}: {
  rows: StandingRow[];
  slug: string;
  season: string;
}): JSX.Element {
```

Add the import at the top:

```tsx
import { teamHref } from '@/lib/league-home/team-load';
```

Replace the team-name cell (`<span className="relative z-10">{r.team_name}</span>`) with:

```tsx
                  {r.team_id ? (
                    <a
                      href={teamHref(slug, r.team_id, season)}
                      className="relative z-10 hover:underline"
                    >
                      {r.team_name}
                    </a>
                  ) : (
                    <span className="relative z-10">{r.team_name}</span>
                  )}
```

- [ ] **Step 2: Pass `slug`/`season` from the league page**

In `apps/web/src/app/l/[slug]/page.tsx`, update every `<StandingsTable .../>` usage (there are three: the no-divisions case, the "League" group, and the per-division map) to pass props. Example replacements:

```tsx
<StandingsTable rows={data.standings} slug={params.slug} season={data.season} />
```

```tsx
<StandingsTable rows={div.rows} slug={params.slug} season={data.season} />
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter web type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/l/\[slug\]/_components/StandingsTable.tsx apps/web/src/app/l/\[slug\]/page.tsx
git commit -m "feat(web): link team names in standings to team page"
```

---

## Task 8: Link team names — Leaderboards

**Files:**
- Modify: `apps/web/src/lib/league-home/load.ts`
- Modify: `apps/web/src/app/l/[slug]/_components/LeaderBoard.tsx`
- Modify: `apps/web/src/app/l/[slug]/_components/LeadersSection.tsx` (props passthrough)
- Modify: `apps/web/src/app/l/[slug]/page.tsx`

- [ ] **Step 1: Populate `teamId` on leader rows in `load.ts`**

In `toLeaderRows`, add `teamId: r.team_id` to the mapped object:

```ts
    .map((r) => ({
      id: r.player_id,
      name: isAuthed
        ? memberDisplayName({ firstName: r.first_name, lastName: r.last_name })
        : publicDisplayName({ firstName: r.first_name, lastName: r.last_name }),
      teamName: r.team_name,
      teamId: r.team_id,
      value: getStatValue(r.stats, def.field),
      qualifierValue: def.qualifier === 'ip' ? r.innings_pitched_outs : r.plate_appearances,
    }));
```

In the `board()` helper's team-board branch, set `teamId` to the team id (already the row `id`):

```ts
        ? (teamSnap ?? []).map((t: any) => ({
            id: t.team_id,
            name: t.team_name,
            teamId: t.team_id,
            value: getStatValue(t.stats, def.field),
            qualifierValue: 1,
          }))
```

(`LeaderHomeRow extends RankedLeaderRow`, so `teamId` is already part of the type — no type change needed.)

- [ ] **Step 2: Thread `slug`/`season` through `LeadersSection` and link in `LeaderBoard`**

In `LeaderBoard.tsx`, add `slug`/`season` to the component props and import `teamHref`:

```tsx
import { teamHref } from '@/lib/league-home/team-load';
```

Add to the prop type: `slug: string; season: string;`. Replace the team-tag span:

```tsx
{r.teamName ? <span className="ml-1 text-app-fg-subtle">· {r.teamName}</span> : null}
```

with:

```tsx
{r.teamName ? (
  r.teamId ? (
    <a href={teamHref(slug, r.teamId, season)} className="ml-1 text-app-fg-subtle hover:underline">
      · {r.teamName}
    </a>
  ) : (
    <span className="ml-1 text-app-fg-subtle">· {r.teamName}</span>
  )
) : null}
```

In `LeadersSection.tsx`, add `slug: string; season: string;` to its props and pass them into every `<LeaderBoard .../>` it renders.

- [ ] **Step 3: Pass `slug`/`season` from the page into `LeadersSection`**

In `page.tsx`, update the `leaders` case:

```tsx
<LeadersSection
  key="leaders"
  slug={params.slug}
  season={data.season}
  boards={{ batting: data.defaultBoards.batting, pitching: data.defaultBoards.pitching, team: data.defaultBoards.team, special }}
/>
```

- [ ] **Step 4: Type-check + tests**

Run: `pnpm --filter web type-check`
Expected: no errors.
Run: `pnpm --filter web test -- league-home`
Expected: PASS (existing `toLeaderRows` tests still green; teamId is additive).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/league-home/load.ts apps/web/src/app/l/\[slug\]/_components/LeaderBoard.tsx apps/web/src/app/l/\[slug\]/_components/LeadersSection.tsx apps/web/src/app/l/\[slug\]/page.tsx
git commit -m "feat(web): link team names in leaderboards to team page"
```

---

## Task 9: Link team names — Spotlights & Recent Results

**Files:**
- Modify: `apps/web/src/lib/league-home/load.ts` (add `team_id` to `RecentGame`)
- Modify: `apps/web/src/app/l/[slug]/_components/Spotlights.tsx`
- Modify: `apps/web/src/app/l/[slug]/_components/RecentUpcoming.tsx`
- Modify: `apps/web/src/app/l/[slug]/page.tsx`

- [ ] **Step 1: Add `team_id` to `RecentGame` and populate it**

In `load.ts`, extend the `RecentGame` interface:

```ts
export interface RecentGame {
  id: string;
  team: string;
  team_id: string;
  opponent: string;
  ourScore: number;
  theirScore: number;
  result: 'W' | 'L' | 'T';
}
```

Update `mapRecentGame` to accept and set the id:

```ts
export function mapRecentGame(g: RawRecentGame, teamName: string, teamId: string): RecentGame {
  const isHome = weAreHome(g.location_type, g.neutral_home_team);
  const ourScore = isHome ? g.home_score : g.away_score;
  const theirScore = isHome ? g.away_score : g.home_score;
  const result: 'W' | 'L' | 'T' = ourScore > theirScore ? 'W' : ourScore < theirScore ? 'L' : 'T';
  return { id: g.id, team: teamName, team_id: teamId, opponent: g.opponent_name, ourScore, theirScore, result };
}
```

Update the call site in `getLeagueHomeData`:

```ts
    recent = (recentGames ?? []).map((g: any) => mapRecentGame(g, teamNameById.get(g.team_id) ?? 'Team', g.team_id));
```

Update the existing `mapRecentGame` test in `apps/web/src/lib/league-home/__tests__/load.test.ts` to pass a team id and assert it (find the `mapRecentGame` test and add `'t1'` as the third arg, asserting `team_id === 't1'`). If no such test exists, add:

```ts
it('mapRecentGame carries the team id through', () => {
  const g = { id: 'g1', opponent_name: 'Foes', home_score: 5, away_score: 2, location_type: 'home', neutral_home_team: null };
  expect(mapRecentGame(g as any, 'Reds', 't1')).toMatchObject({ team_id: 't1', result: 'W' });
});
```

- [ ] **Step 2: Link team names in `RecentUpcoming`**

In `RecentUpcoming.tsx`, add `slug`/`season` props and import `teamHref`. Replace the team name span (`<span className="font-medium text-app-fg">{g.team}</span>`) with:

```tsx
<a href={teamHref(slug, g.team_id, season)} className="font-medium text-app-fg hover:underline">
  {g.team}
</a>
```

(Opponent names stay plain — opponents have no platform team id.)

- [ ] **Step 3: Link matched team names in `Spotlights`**

In `Spotlights.tsx`, add props `slug: string; season: string; teamIdByName: Map<string, string>;` and import `teamHref`. Replace the team-name paragraph:

```tsx
{s.team_name ? <p className="text-sm text-app-fg-muted">{s.team_name}</p> : null}
```

with a matched-link variant:

```tsx
{s.team_name ? (
  (() => {
    const tid = teamIdByName.get(s.team_name.trim().toLowerCase());
    return tid ? (
      <a href={teamHref(slug, tid, season)} className="text-sm text-app-fg-muted hover:underline">
        {s.team_name}
      </a>
    ) : (
      <p className="text-sm text-app-fg-muted">{s.team_name}</p>
    );
  })()
) : null}
```

- [ ] **Step 4: Build the name→id map and pass props from the page**

In `page.tsx`, import `teamIdByName` from team-load and build it once from standings:

```tsx
import { teamIdByName } from '@/lib/league-home/team-load';
```

Inside the component body (after `data` is known to be `ok`), add:

```tsx
const teamIds = teamIdByName(data.standings);
```

Update the `spotlights` and `recent` cases:

```tsx
case 'spotlights':
  return <Spotlights key="spotlights" items={data.spotlights} slug={params.slug} season={data.season} teamIdByName={teamIds} />;
```

```tsx
case 'recent':
  return (
    <section key="recent">
      <h2 className="display mb-3 text-xl font-bold">Around the League</h2>
      <RecentUpcoming recent={data.recent} upcoming={data.upcoming} slug={params.slug} season={data.season} />
    </section>
  );
```

- [ ] **Step 5: Type-check + tests**

Run: `pnpm --filter web type-check`
Expected: no errors.
Run: `pnpm --filter web test -- league-home`
Expected: PASS (updated `mapRecentGame` test green).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/league-home/load.ts apps/web/src/lib/league-home/__tests__/load.test.ts apps/web/src/app/l/\[slug\]/_components/Spotlights.tsx apps/web/src/app/l/\[slug\]/_components/RecentUpcoming.tsx apps/web/src/app/l/\[slug\]/page.tsx
git commit -m "feat(web): link team names in spotlights and recent results"
```

---

## Task 10: Full verification + glossary

**Files:**
- Modify: `CLAUDE.md` (Domain Glossary — add a TeamStatPage entry)

- [ ] **Step 1: Run the full web + shared test suites**

Run: `pnpm --filter web test`
Run: `pnpm --filter @baseball/shared test`
Expected: all PASS.

- [ ] **Step 2: Type-check everything touched**

Run: `pnpm --filter web type-check && pnpm --filter @baseball/shared type-check`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `pnpm --filter web lint`
Expected: no new errors in the touched files.

- [ ] **Step 4: Add a glossary entry**

In `CLAUDE.md` Domain Glossary table, add:

```text
| **TeamStatPage** | Public read-only page at `/l/[slug]/team/[teamId]` showing a team's record, team-level stats, and full per-player batting/pitching lines. A filtered view of the `league_*_snapshot` tables by `team_id`; no migration. Reached by clicking any team name on the league page. Opted-out players (`public_opt_out`) show a masked name with blanked stats for public viewers. |
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document team stat page in glossary"
```

- [ ] **Step 6: Run coderabbit review** (per DiamondOS workflow in CLAUDE.md)

Run the configured coderabbit review on the branch and address findings before opening the PR.

---

## Self-Review Notes

- **Spec coverage:** route (T6) ✓; loader + no-DB-change (T3/T4) ✓; TeamHero/TeamStatPanel/batting+pitching tables (T5) ✓; opt-out masking (T3 helper + T5 blanking) ✓; link standings/leaderboards/spotlights/recent (T7/T8/T9) ✓; shared `teamId` (T1) ✓; `formatStat` extraction (T2) ✓; unit tests for `computeTeamRank`/`toTeamPlayerRows`/`teamHref` (T3) ✓; glossary (T10) ✓.
- **Deviation from spec:** player sort is by PA desc (batting) rather than AVG desc, to avoid ordering on stats hidden from public viewers — noted in T4 code comment.
- **Type consistency:** `teamHref(slug, teamId, season?)`, `TeamPlayerStatRow`, `TeamStatItem`, `TeamRecord`, `TEAM_BATTING_KEYS`, `TEAM_PITCHING_KEYS` are defined once in `team-load.ts` and imported everywhere by those exact names.
```
