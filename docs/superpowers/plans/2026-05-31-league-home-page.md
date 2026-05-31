# League Home Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, server-rendered league home page (`/l/[slug]`) that shows standings, default + up to 5 admin-defined statistical-leader boards, recent/upcoming games, and auto spotlights — backed by precomputed snapshot tables and an admin settings panel.

**Architecture:** The public page never replays `game_events` at request time. A Node recompute job (reusing `@baseball/shared` stat reducers) aggregates completed games into four season-scoped snapshot tables, triggered when a game is finalized and by a scheduled safety-net rebuild. The page reads only those snapshots via the service-role client, applies a visibility gate (`public` vs `signed_in`) and minor-privacy name masking, and renders configurable sections themed per league.

**Tech Stack:** Next.js 14 App Router (web), Supabase Postgres + RLS, `@baseball/shared` (Zod + TS stat reducers), `@baseball/database` (typed client + query helpers), Jest (ts-jest), Tailwind, Vercel Cron.

**Key decisions & assumptions (carry into every task):**
- **League season = a season *name* string.** `seasons` is per-team (`seasons.name` text). A "league season" is the set of per-team seasons sharing a `name` among the league's teams. Snapshots are keyed `(league_id, season)` where `season` is that name. The season switcher lists distinct names; default season = `leagues.current_season`.
- **Stat attribution** uses `game_lineups.team_id`/`player_id` and honors `count_toward_stats`.
- **Within-league player identity** = `league_players.player_id` (stable across team transfers in a league).
- **Visibility = 'signed_in'** means any authenticated platform user (not just members).
- Reducers return `Map<playerId, Stats>`; main fns: `deriveBattingStats`, `derivePitchingStats`, `deriveFieldingStats` in `packages/shared/src/utils/`.
- Admin-only writes are enforced at the **API layer** (RLS allows any `league_staff` to update `leagues`; there is no column-level RLS).
- v2 (NOT in this plan): public player career page, public team detail pages, clickable names, mobile view, milestones feed, admin-tunable spotlights, cross-league identity.

---

## File Structure

**Shared (`packages/shared/src/`)**
- Create `validation/league-home-theme.ts` — `leagueHomeThemeSchema`, `LeagueHomeTheme`, `DEFAULT_LEAGUE_HOME_THEME`, `mergeWithThemeDefaults`.
- Create `validation/league-leader-config.ts` — `leagueLeaderConfigSchema`, `LeagueLeaderConfig`, `DEFAULT_LEADER_CONFIG`.
- Create `constants/stat-catalog.ts` — `STAT_CATALOG` (every selectable stat: key, label, subject, sortDir, isRate, qualifier).
- Create `utils/league-leaderboard.ts` — `buildLeaderboard` (pure ranking + qualifier + ties).
- Create `utils/league-spotlight.ts` — `selectSpotlights` (pure).
- Create `utils/player-display-name.ts` — `publicDisplayName` / `memberDisplayName`.
- Tests under each dir's `__tests__/`.

**Migrations (`supabase/migrations/`)**
- `20260531000001_league_home_columns.sql` — leagues: slug, visibility, home_theme, leader_config (+ backfill slug).
- `20260531000002_league_players_public_opt_out.sql`.
- `20260531000003_league_stat_snapshots.sql` — 4 snapshot tables + RLS + indexes + triggers.

**Web (`apps/web/src/`)**
- Create `lib/league-snapshot/recompute.ts` — `recomputeLeagueSnapshot(db, leagueId, season)` orchestrator.
- Create `lib/league-snapshot/standings.ts` — `computeStandings` (pure).
- Create `lib/league-snapshot/aggregate.ts` — `aggregateSeasonStats` (combines per-game reducer output; pure).
- Create `lib/league-snapshot/season.ts` — `resolveLeagueSeasonGameIds`, `listLeagueSeasons`.
- Create `lib/league-home/load.ts` — `getLeagueHomeData(slug, viewerIsAuthed, season?)`.
- Create `app/l/[slug]/page.tsx`, `app/l/[slug]/opengraph-image.tsx`, and `app/l/[slug]/_components/*`.
- Create `app/api/league/home-settings/route.ts`, `app/api/league/player-opt-out/route.ts`, `app/api/cron/rebuild-league-snapshots/route.ts`.
- Create `app/(app)/league/admin/HomePageSettingsForm.tsx`, `app/(app)/league/admin/CustomCategoriesEditor.tsx`.
- Modify `middleware.ts` (allow `/l/`), `app/(app)/games/[gameId]/actions.ts` (trigger recompute), `app/(app)/league/admin/page.tsx` (mount panel), `vercel.json` (cron).

---

# PHASE 0 — Shared foundations (pure, fully unit-tested)

### Task 1: Stat catalog constant

**Files:**
- Create: `packages/shared/src/constants/stat-catalog.ts`
- Test: `packages/shared/src/constants/__tests__/stat-catalog.test.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './constants/stat-catalog';`)

- [ ] **Step 1: Write the failing test**
```typescript
import { STAT_CATALOG, getStatDef, type StatKey } from '../stat-catalog';

describe('STAT_CATALOG', () => {
  it('exposes batting, pitching, and team stats with unique keys', () => {
    const keys = STAT_CATALOG.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['avg', 'homeRuns', 'era', 'teamEra']));
  });

  it('marks rate stats as qualified and counting stats as not', () => {
    expect(getStatDef('avg').isRate).toBe(true);
    expect(getStatDef('homeRuns').isRate).toBe(false);
  });

  it('every stat declares subject and sort direction', () => {
    for (const s of STAT_CATALOG) {
      expect(['player', 'team']).toContain(s.subject);
      expect(['asc', 'desc']).toContain(s.sortDir);
    }
  });

  it('getStatDef throws on unknown key', () => {
    expect(() => getStatDef('nope' as StatKey)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @baseball/shared test -- stat-catalog`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**
```typescript
// packages/shared/src/constants/stat-catalog.ts
export type StatSubject = 'player' | 'team';
export type SortDir = 'asc' | 'desc'; // asc = lower is better (ERA, WHIP)
export type QualifierKind = 'none' | 'pa' | 'ip';

export interface StatDef {
  key: string;
  label: string;
  subject: StatSubject;
  sortDir: SortDir;
  isRate: boolean;
  qualifier: QualifierKind; // which minimum applies on rate boards
  /** dot-path into the snapshot stat row (player or team) */
  field: string;
  /** display formatter id */
  format: 'avg3' | 'int' | 'pct1' | 'ip' | 'ratio2';
}

export const STAT_CATALOG: readonly StatDef[] = [
  // Batting (player)
  { key: 'avg',        label: 'AVG', subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa', field: 'avg',        format: 'avg3' },
  { key: 'obp',        label: 'OBP', subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa', field: 'obp',        format: 'avg3' },
  { key: 'slg',        label: 'SLG', subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa', field: 'slg',        format: 'avg3' },
  { key: 'ops',        label: 'OPS', subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa', field: 'ops',        format: 'avg3' },
  { key: 'homeRuns',   label: 'HR',  subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'homeRuns', format: 'int' },
  { key: 'rbi',        label: 'RBI', subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'rbi',      format: 'int' },
  { key: 'hits',       label: 'H',   subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'hits',     format: 'int' },
  { key: 'runs',       label: 'R',   subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'runs',     format: 'int' },
  { key: 'doubles',    label: '2B',  subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'doubles',  format: 'int' },
  { key: 'triples',    label: '3B',  subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'triples',  format: 'int' },
  { key: 'walks',      label: 'BB',  subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'walks',    format: 'int' },
  { key: 'qabPct',     label: 'QAB%',subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa', field: 'qabPct',     format: 'pct1' },
  { key: 'hardHitPct', label: 'Hard-Hit%', subject: 'player', sortDir: 'desc', isRate: true, qualifier: 'pa', field: 'hardHitPct', format: 'pct1' },
  // Pitching (player)
  { key: 'era',        label: 'ERA', subject: 'player', sortDir: 'asc',  isRate: true,  qualifier: 'ip', field: 'era',        format: 'ratio2' },
  { key: 'whip',       label: 'WHIP',subject: 'player', sortDir: 'asc',  isRate: true,  qualifier: 'ip', field: 'whip',       format: 'ratio2' },
  { key: 'strikeoutsP',label: 'K (P)',subject:'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'strikeoutsP', format: 'int' },
  // Team
  { key: 'teamAvg',    label: 'Team AVG', subject: 'team', sortDir: 'desc', isRate: true,  qualifier: 'none', field: 'teamAvg', format: 'avg3' },
  { key: 'teamEra',    label: 'Team ERA', subject: 'team', sortDir: 'asc',  isRate: true,  qualifier: 'none', field: 'teamEra', format: 'ratio2' },
  { key: 'runsScored', label: 'Runs Scored', subject: 'team', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'runsScored', format: 'int' },
  { key: 'runDiff',    label: 'Run Diff', subject: 'team', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'runDiff', format: 'int' },
] as const;

export type StatKey = (typeof STAT_CATALOG)[number]['key'];

const BY_KEY = new Map(STAT_CATALOG.map((s) => [s.key, s]));

export function getStatDef(key: StatKey): StatDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown stat key: ${key}`);
  return def;
}
```
> NOTE for implementer: `field` names must match the snapshot column names defined in Task 9 and the aggregation output in Task 13. If you rename a stat field there, update it here.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @baseball/shared test -- stat-catalog`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/constants/stat-catalog.ts packages/shared/src/constants/__tests__/stat-catalog.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add league stat catalog"
```

---

### Task 2: League home theme schema

**Files:**
- Create: `packages/shared/src/validation/league-home-theme.ts`
- Test: `packages/shared/src/validation/__tests__/league-home-theme.test.ts`
- Modify: `packages/shared/src/validation/index.ts` (add `export * from './league-home-theme';`)

- [ ] **Step 1: Write the failing test**
```typescript
import { leagueHomeThemeSchema, DEFAULT_LEAGUE_HOME_THEME, mergeWithThemeDefaults, ALL_SECTIONS } from '../league-home-theme';

describe('leagueHomeThemeSchema', () => {
  it('accepts a full valid theme', () => {
    const r = leagueHomeThemeSchema.safeParse({
      accentColor: '#1e90ff', secondaryColor: '#0b1f3a',
      bannerUrl: 'https://x/y.png', heroTitle: 'Spring 2026', heroTagline: 'Play ball',
      sections: ALL_SECTIONS.map((id) => ({ id, enabled: true })),
    });
    expect(r.success).toBe(true);
  });

  it('rejects a bad hex color', () => {
    const r = leagueHomeThemeSchema.safeParse({ accentColor: 'blue' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown section ids', () => {
    const r = leagueHomeThemeSchema.safeParse({ sections: [{ id: 'bogus', enabled: true }] });
    expect(r.success).toBe(false);
  });

  it('mergeWithThemeDefaults fills missing fields and all sections', () => {
    const merged = mergeWithThemeDefaults({ heroTitle: 'X' });
    expect(merged.heroTitle).toBe('X');
    expect(merged.accentColor).toBe(DEFAULT_LEAGUE_HOME_THEME.accentColor);
    expect(merged.sections.map((s) => s.id).sort()).toEqual([...ALL_SECTIONS].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @baseball/shared test -- league-home-theme`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**
```typescript
// packages/shared/src/validation/league-home-theme.ts
import { z } from 'zod';

export const ALL_SECTIONS = ['hero', 'standings', 'leaders', 'customLeaders', 'recent', 'spotlights'] as const;
export type SectionId = (typeof ALL_SECTIONS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB hex color');

const sectionSchema = z.object({
  id: z.enum(ALL_SECTIONS),
  enabled: z.boolean(),
});

export const leagueHomeThemeSchema = z
  .object({
    accentColor: hex,
    secondaryColor: hex,
    bannerUrl: z.string().url().nullable(),
    heroTitle: z.string().max(80),
    heroTagline: z.string().max(160),
    sections: z.array(sectionSchema),
  })
  .strict();

export type LeagueHomeTheme = z.infer<typeof leagueHomeThemeSchema>;

export const DEFAULT_LEAGUE_HOME_THEME: LeagueHomeTheme = {
  accentColor: '#1e90ff',
  secondaryColor: '#0b1f3a',
  bannerUrl: null,
  heroTitle: '',
  heroTagline: '',
  sections: ALL_SECTIONS.map((id) => ({ id, enabled: true })),
};

export function mergeWithThemeDefaults(input: unknown): LeagueHomeTheme {
  const partial = (input ?? {}) as Partial<LeagueHomeTheme>;
  const provided = new Map((partial.sections ?? []).map((s) => [s.id, s.enabled]));
  return {
    accentColor: partial.accentColor ?? DEFAULT_LEAGUE_HOME_THEME.accentColor,
    secondaryColor: partial.secondaryColor ?? DEFAULT_LEAGUE_HOME_THEME.secondaryColor,
    bannerUrl: partial.bannerUrl ?? null,
    heroTitle: partial.heroTitle ?? '',
    heroTagline: partial.heroTagline ?? '',
    sections: ALL_SECTIONS.map((id) => ({ id, enabled: provided.get(id) ?? true })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @baseball/shared test -- league-home-theme`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/validation/league-home-theme.ts packages/shared/src/validation/__tests__/league-home-theme.test.ts packages/shared/src/validation/index.ts
git commit -m "feat(shared): add league home theme schema"
```

---

### Task 3: League leader config schema (custom categories + qualifier overrides)

**Files:**
- Create: `packages/shared/src/validation/league-leader-config.ts`
- Test: `packages/shared/src/validation/__tests__/league-leader-config.test.ts`
- Modify: `packages/shared/src/validation/index.ts` (add export)

- [ ] **Step 1: Write the failing test**
```typescript
import { leagueLeaderConfigSchema, DEFAULT_LEADER_CONFIG } from '../league-leader-config';

const validKeys = ['avg', 'homeRuns', 'era', 'teamEra']; // subset is fine

describe('leagueLeaderConfigSchema', () => {
  it('accepts up to 5 custom categories referencing catalog keys', () => {
    const r = leagueLeaderConfigSchema.safeParse({
      custom: [
        { statKey: 'doubles', label: 'Doubles Kings', limit: 10 },
        { statKey: 'whip', label: 'Stingiest', limit: 5 },
      ],
      qualifierOverrides: { paPerGame: 2.5, ipPerGame: 1.0 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects more than 5 custom categories', () => {
    const custom = Array.from({ length: 6 }, (_, i) => ({ statKey: 'hits', label: `c${i}`, limit: 10 }));
    expect(leagueLeaderConfigSchema.safeParse({ custom }).success).toBe(false);
  });

  it('rejects a statKey not in the catalog', () => {
    expect(leagueLeaderConfigSchema.safeParse({ custom: [{ statKey: 'zzz', label: 'x', limit: 10 }] }).success).toBe(false);
  });

  it('DEFAULT_LEADER_CONFIG has empty custom list', () => {
    expect(DEFAULT_LEADER_CONFIG.custom).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @baseball/shared test -- league-leader-config`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**
```typescript
// packages/shared/src/validation/league-leader-config.ts
import { z } from 'zod';
import { STAT_CATALOG } from '../constants/stat-catalog';

const STAT_KEYS = STAT_CATALOG.map((s) => s.key) as [string, ...string[]];

const customCategorySchema = z.object({
  statKey: z.enum(STAT_KEYS),
  label: z.string().min(1).max(40),
  limit: z.number().int().min(3).max(25).default(10),
});

export const leagueLeaderConfigSchema = z
  .object({
    custom: z.array(customCategorySchema).max(5).default([]),
    qualifierOverrides: z
      .object({
        paPerGame: z.number().min(0).max(10).optional(),
        ipPerGame: z.number().min(0).max(10).optional(),
      })
      .default({}),
  })
  .strict();

export type LeagueLeaderConfig = z.infer<typeof leagueLeaderConfigSchema>;
export type CustomCategory = z.infer<typeof customCategorySchema>;

export const DEFAULT_LEADER_CONFIG: LeagueLeaderConfig = { custom: [], qualifierOverrides: {} };
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @baseball/shared test -- league-leader-config`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/validation/league-leader-config.ts packages/shared/src/validation/__tests__/league-leader-config.test.ts packages/shared/src/validation/index.ts
git commit -m "feat(shared): add league leader config schema"
```

---

### Task 4: Player display-name helper (privacy masking)

**Files:**
- Create: `packages/shared/src/utils/player-display-name.ts`
- Test: `packages/shared/src/utils/__tests__/player-display-name.test.ts`
- Modify: `packages/shared/src/index.ts` (ensure `export * from './utils/player-display-name';` — confirm utils are re-exported; if `index.ts` re-exports utils via a barrel, add there)

- [ ] **Step 1: Write the failing test**
```typescript
import { publicDisplayName, memberDisplayName } from '../player-display-name';

describe('player display name', () => {
  const p = { firstName: 'Alex', lastName: 'Ramirez' };
  it('member view shows full name', () => {
    expect(memberDisplayName(p)).toBe('Alex Ramirez');
  });
  it('public view shows first name + last initial', () => {
    expect(publicDisplayName(p)).toBe('Alex R.');
  });
  it('handles empty last name gracefully', () => {
    expect(publicDisplayName({ firstName: 'Sam', lastName: '' })).toBe('Sam');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @baseball/shared test -- player-display-name`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**
```typescript
// packages/shared/src/utils/player-display-name.ts
export interface NameParts { firstName: string; lastName: string; }

export function memberDisplayName(p: NameParts): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function publicDisplayName(p: NameParts): string {
  const initial = p.lastName?.trim()?.[0];
  return initial ? `${p.firstName} ${initial}.` : p.firstName;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @baseball/shared test -- player-display-name`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/utils/player-display-name.ts packages/shared/src/utils/__tests__/player-display-name.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add player display-name privacy helper"
```

---

### Task 5: Leaderboard builder (pure ranking + qualifier + ties)

**Files:**
- Create: `packages/shared/src/utils/league-leaderboard.ts`
- Test: `packages/shared/src/utils/__tests__/league-leaderboard.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**
```typescript
import { buildLeaderboard, type LeaderRow } from '../league-leaderboard';
import { getStatDef } from '../constants/stat-catalog';

const rows: LeaderRow[] = [
  { id: 'a', name: 'A', value: 0.400, qualifierValue: 1 },  // below min
  { id: 'b', name: 'B', value: 0.350, qualifierValue: 30 },
  { id: 'c', name: 'C', value: 0.350, qualifierValue: 30 }, // tie with b
  { id: 'd', name: 'D', value: 0.300, qualifierValue: 30 },
];

describe('buildLeaderboard', () => {
  it('filters below-qualifier rows for rate stats and ranks desc', () => {
    const out = buildLeaderboard(rows, getStatDef('avg'), { minQualifier: 10, limit: 10 });
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'd']); // 'a' excluded
    expect(out[0].rank).toBe(1);
  });
  it('assigns tied ranks (1,1,3 style) on equal values', () => {
    const out = buildLeaderboard(rows, getStatDef('avg'), { minQualifier: 10, limit: 10 });
    expect(out[0].rank).toBe(1);
    expect(out[1].rank).toBe(1);
    expect(out[2].rank).toBe(3);
  });
  it('sorts asc for asc-direction stats (ERA: lower is better)', () => {
    const eraRows: LeaderRow[] = [
      { id: 'x', name: 'X', value: 1.5, qualifierValue: 20 },
      { id: 'y', name: 'Y', value: 3.0, qualifierValue: 20 },
    ];
    const out = buildLeaderboard(eraRows, getStatDef('era'), { minQualifier: 0, limit: 10 });
    expect(out.map((r) => r.id)).toEqual(['x', 'y']);
  });
  it('respects limit', () => {
    const out = buildLeaderboard(rows, getStatDef('avg'), { minQualifier: 10, limit: 2 });
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @baseball/shared test -- league-leaderboard`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**
```typescript
// packages/shared/src/utils/league-leaderboard.ts
import type { StatDef } from '../constants/stat-catalog';

export interface LeaderRow {
  id: string;
  name: string;
  value: number;
  qualifierValue: number; // PA, IP-outs, etc. Ignored when stat.qualifier === 'none'
  teamName?: string;
}

export interface RankedLeaderRow extends LeaderRow {
  rank: number;
}

export interface BuildOpts {
  minQualifier: number; // already-resolved threshold for this board
  limit: number;
}

export function buildLeaderboard(rows: LeaderRow[], stat: StatDef, opts: BuildOpts): RankedLeaderRow[] {
  const eligible = stat.qualifier === 'none' || !stat.isRate
    ? rows
    : rows.filter((r) => r.qualifierValue >= opts.minQualifier);

  const sorted = [...eligible].sort((a, b) =>
    stat.sortDir === 'asc' ? a.value - b.value : b.value - a.value,
  );

  const ranked: RankedLeaderRow[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;
  sorted.forEach((row, i) => {
    const rank = lastValue !== null && row.value === lastValue ? lastRank : i + 1;
    ranked.push({ ...row, rank });
    lastValue = row.value;
    lastRank = rank;
  });

  return ranked.slice(0, opts.limit);
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @baseball/shared test -- league-leaderboard`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/utils/league-leaderboard.ts packages/shared/src/utils/__tests__/league-leaderboard.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add pure leaderboard builder"
```

---

### Task 6: Spotlight selection (pure)

**Files:**
- Create: `packages/shared/src/utils/league-spotlight.ts`
- Test: `packages/shared/src/utils/__tests__/league-spotlight.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**
```typescript
import { selectSpotlights, type SpotlightCandidate } from '../league-spotlight';

const batters: SpotlightCandidate[] = [
  { id: 'p1', name: 'P1', teamName: 'Reds', score: 1.2, qualifierValue: 10 },
  { id: 'p2', name: 'P2', teamName: 'Jays', score: 0.9, qualifierValue: 10 },
  { id: 'p3', name: 'P3', teamName: 'Reds', score: 2.0, qualifierValue: 1 }, // below min
];
const teams: SpotlightCandidate[] = [
  { id: 't1', name: 'Reds', score: 0.8, qualifierValue: 3 },
  { id: 't2', name: 'Jays', score: 0.5, qualifierValue: 3 },
];

describe('selectSpotlights', () => {
  it('picks the top qualified batter and hottest team', () => {
    const out = selectSpotlights({ batters, teams, minBatterQualifier: 5 });
    expect(out.playerOfWeek?.id).toBe('p1');
    expect(out.hotTeam?.id).toBe('t1');
  });
  it('returns nulls when no candidates qualify', () => {
    const out = selectSpotlights({ batters: [], teams: [], minBatterQualifier: 5 });
    expect(out.playerOfWeek).toBeNull();
    expect(out.hotTeam).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @baseball/shared test -- league-spotlight`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**
```typescript
// packages/shared/src/utils/league-spotlight.ts
export interface SpotlightCandidate {
  id: string;
  name: string;
  teamName?: string;
  score: number;          // higher = better (precomputed composite over the window)
  qualifierValue: number;
}

export interface SpotlightInput {
  batters: SpotlightCandidate[];
  teams: SpotlightCandidate[];
  minBatterQualifier: number;
}

export interface Spotlights {
  playerOfWeek: SpotlightCandidate | null;
  hotTeam: SpotlightCandidate | null;
}

function topByScore(list: SpotlightCandidate[]): SpotlightCandidate | null {
  return list.reduce<SpotlightCandidate | null>(
    (best, c) => (best === null || c.score > best.score ? c : best),
    null,
  );
}

export function selectSpotlights(input: SpotlightInput): Spotlights {
  const qualifiedBatters = input.batters.filter((b) => b.qualifierValue >= input.minBatterQualifier);
  return { playerOfWeek: topByScore(qualifiedBatters), hotTeam: topByScore(input.teams) };
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @baseball/shared test -- league-spotlight`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/utils/league-spotlight.ts packages/shared/src/utils/__tests__/league-spotlight.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add pure spotlight selection"
```

---

# PHASE 1 — Database migrations

> After all three migrations: run `supabase db reset` then `pnpm --filter @baseball/database gen-types` and commit the regenerated `packages/database/src/types/supabase.ts` (its own commit). Do this as the final step of Task 9.

### Task 7: Leagues home columns migration

**Files:**
- Create: `supabase/migrations/20260531000001_league_home_columns.sql`

- [ ] **Step 1: Write the migration**
```sql
-- League home page: public URL slug, visibility, theme, and leader config.
-- slug/visibility/home_theme/leader_config drive the public /l/[slug] page.
-- Shape of home_theme and leader_config is validated in @baseball/shared
-- (leagueHomeThemeSchema, leagueLeaderConfigSchema); DB only asserts JSON object.

alter table public.leagues
  add column slug          text,
  add column visibility    text not null default 'public',
  add column home_theme    jsonb not null default '{}'::jsonb,
  add column leader_config  jsonb not null default '{}'::jsonb;

alter table public.leagues
  add constraint leagues_visibility_check
  check (visibility in ('public', 'signed_in'));

alter table public.leagues
  add constraint leagues_home_theme_is_object
  check (jsonb_typeof(home_theme) = 'object');

alter table public.leagues
  add constraint leagues_leader_config_is_object
  check (jsonb_typeof(leader_config) = 'object');

-- Backfill a unique slug from name for existing leagues:
-- lowercased, non-alphanumerics to hyphens, de-duplicated with a short id suffix.
update public.leagues
set slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
           || '-' || left(replace(id::text, '-', ''), 6)
where slug is null;

alter table public.leagues alter column slug set not null;
create unique index leagues_slug_key on public.leagues(slug);

comment on column public.leagues.slug is 'Public URL identifier for /l/[slug]. Lowercase kebab-case, globally unique.';
comment on column public.leagues.visibility is 'public = anyone; signed_in = any authenticated user only.';
```

- [ ] **Step 2: Apply locally & verify**
Run: `supabase db reset`
Expected: completes with no error; `leagues` now has `slug`, `visibility`, `home_theme`, `leader_config`. Verify: `psql "$LOCAL_DB_URL" -c "select slug, visibility from public.leagues limit 5;"` returns rows with non-null slugs.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260531000001_league_home_columns.sql
git commit -m "feat(db): add league slug/visibility/theme/leader_config columns"
```

---

### Task 8: Player public opt-out migration

**Files:**
- Create: `supabase/migrations/20260531000002_league_players_public_opt_out.sql`

- [ ] **Step 1: Write the migration**
```sql
-- Per-league, per-player suppression from public listings (minor-privacy control).
alter table public.league_players
  add column public_opt_out boolean not null default false;

comment on column public.league_players.public_opt_out is
  'When true, this player is omitted from publicly visible league leaderboards/spotlights. Full names are only shown to signed-in members regardless.';
```

- [ ] **Step 2: Apply locally & verify**
Run: `supabase db reset`
Expected: no error; `league_players.public_opt_out` exists defaulting to false.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260531000002_league_players_public_opt_out.sql
git commit -m "feat(db): add league_players.public_opt_out"
```

---

### Task 9: Snapshot tables migration (+ regen types)

**Files:**
- Create: `supabase/migrations/20260531000003_league_stat_snapshots.sql`
- Modify: `packages/database/src/types/supabase.ts` (regenerated)

- [ ] **Step 1: Write the migration**
```sql
-- Precomputed, season-scoped snapshots for the public league home page.
-- Written exclusively by the recompute job (service role, bypasses RLS).
-- Read by: the page (service role) and league members; public rows readable
-- by anon only when the parent league is public.

-- Shared updated_at trigger fn already exists in earlier migrations as
-- public.touch_updated_at(); reuse it.

-- 1) Standings -------------------------------------------------------------
create table public.league_standings_snapshot (
  league_id     uuid not null references public.leagues(id) on delete cascade,
  season        text not null,
  team_id       uuid not null references public.teams(id) on delete cascade,
  division_id   uuid references public.league_divisions(id) on delete set null,
  team_name     text not null,
  wins          integer not null default 0,
  losses        integer not null default 0,
  ties          integer not null default 0,
  runs_for      integer not null default 0,
  runs_against  integer not null default 0,
  win_pct       numeric(5,4) not null default 0,
  streak        text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (league_id, season, team_id)
);

-- 2) Player stats ----------------------------------------------------------
create table public.league_player_stat_snapshot (
  league_id        uuid not null references public.leagues(id) on delete cascade,
  season           text not null,
  player_id        uuid not null references public.players(id) on delete cascade,
  team_id          uuid not null references public.teams(id) on delete cascade,
  team_name        text not null,
  first_name       text not null,
  last_name        text not null,
  public_opt_out   boolean not null default false,
  stats            jsonb not null default '{}'::jsonb, -- batting+pitching+fielding fields keyed per stat-catalog `field`
  plate_appearances integer not null default 0,
  innings_pitched_outs integer not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (league_id, season, player_id)
);

-- 3) Team stats ------------------------------------------------------------
create table public.league_team_stat_snapshot (
  league_id   uuid not null references public.leagues(id) on delete cascade,
  season      text not null,
  team_id     uuid not null references public.teams(id) on delete cascade,
  team_name   text not null,
  stats       jsonb not null default '{}'::jsonb, -- teamAvg, teamEra, runsScored, runDiff, ...
  updated_at  timestamptz not null default now(),
  primary key (league_id, season, team_id)
);

-- 4) Spotlights ------------------------------------------------------------
create table public.league_spotlight_snapshot (
  league_id    uuid not null references public.leagues(id) on delete cascade,
  season       text not null,
  type         text not null check (type in ('player_of_week', 'hot_team')),
  subject_id   uuid not null,
  subject_name text not null,
  team_name    text,
  blurb        text not null default '',
  window_days  integer not null default 7,
  updated_at   timestamptz not null default now(),
  primary key (league_id, season, type)
);

-- Indexes for the page's common reads (by league+season)
create index idx_lss_league_season  on public.league_standings_snapshot(league_id, season);
create index idx_lpss_league_season on public.league_player_stat_snapshot(league_id, season);
create index idx_ltss_league_season on public.league_team_stat_snapshot(league_id, season);

-- updated_at triggers
create trigger trg_lss_touch  before update on public.league_standings_snapshot  for each row execute function public.touch_updated_at();
create trigger trg_lpss_touch before update on public.league_player_stat_snapshot for each row execute function public.touch_updated_at();
create trigger trg_ltss_touch before update on public.league_team_stat_snapshot  for each row execute function public.touch_updated_at();
create trigger trg_lspot_touch before update on public.league_spotlight_snapshot for each row execute function public.touch_updated_at();

-- RLS: members/staff/platform admin always read; anon reads only public leagues.
do $$
declare t text;
begin
  foreach t in array array[
    'league_standings_snapshot','league_player_stat_snapshot',
    'league_team_stat_snapshot','league_spotlight_snapshot'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "members_or_public_read" on public.%I for select
      using (
        exists (select 1 from public.leagues l where l.id = league_id and l.visibility = 'public')
        or public.is_league_member(league_id, auth.uid())
        or public.is_league_staff(league_id, auth.uid())
        or public.is_platform_admin()
      );
    $f$, t);
  end loop;
end $$;
```
> NOTE: Verify the shared touch trigger function name. If the codebase uses `public.set_updated_at()` or `public.handle_updated_at()` instead of `public.touch_updated_at()`, substitute the correct name (grep `create or replace function public.*updated_at` in `supabase/migrations/`).

- [ ] **Step 2: Apply locally & verify**
Run: `supabase db reset`
Expected: completes; four `*_snapshot` tables exist with RLS enabled. Verify: `psql "$LOCAL_DB_URL" -c "\dt public.league_*_snapshot"` lists all four.

- [ ] **Step 3: Regenerate types & commit**
Run: `pnpm --filter @baseball/database gen-types`
Then:
```bash
git add supabase/migrations/20260531000003_league_stat_snapshots.sql packages/database/src/types/supabase.ts
git commit -m "feat(db): add league stat snapshot tables + RLS"
```

---

# PHASE 2 — Snapshot refresh engine (Node, in web app)

### Task 10: League season resolver

**Files:**
- Create: `apps/web/src/lib/league-snapshot/season.ts`
- Test: `apps/web/src/lib/league-snapshot/__tests__/season.test.ts`

> The DB client is passed in; tests use a tiny fake with the same chainable shape used elsewhere (`.from().select().in()...`). Mirror the fake-builder pattern already used in web tests if one exists; otherwise the inline fake below is sufficient.

- [ ] **Step 1: Write the failing test**
```typescript
import { listLeagueSeasons } from '../season';

function fakeDb(seasonsRows: any[]) {
  return {
    from(table: string) {
      return {
        select() { return this; },
        in() { return Promise.resolve({ data: seasonsRows, error: null }); },
      } as any;
    },
  } as any;
}

describe('listLeagueSeasons', () => {
  it('returns distinct season names across the league team ids, newest-ish first by name desc', async () => {
    const db = fakeDb([
      { name: 'Spring 2026' }, { name: 'Fall 2025' }, { name: 'Spring 2026' },
    ]);
    const out = await listLeagueSeasons(db, ['t1', 't2']);
    expect(out).toEqual(['Spring 2026', 'Fall 2025']);
  });
  it('returns [] when there are no teams', async () => {
    expect(await listLeagueSeasons(fakeDb([]), [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter web test -- season` (if web has no jest yet, see NOTE below)
Expected: FAIL — module not found.
> NOTE: If `apps/web` has no test runner configured, add jest+ts-jest to `apps/web` mirroring `packages/shared`'s config (copy its `jest.config.js`/`ts-jest` devDeps and a `"test": "jest"` script) as Step 0, commit that as `chore(web): add jest`, then proceed.

- [ ] **Step 3: Write minimal implementation**
```typescript
// apps/web/src/lib/league-snapshot/season.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function listLeagueSeasons(db: SupabaseClient, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const { data, error } = await db.from('seasons').select('name').in('team_id', teamIds);
  if (error) throw new Error(`listLeagueSeasons failed: ${error.message}`);
  const names = Array.from(new Set((data ?? []).map((r: { name: string }) => r.name)));
  return names.sort((a, b) => b.localeCompare(a));
}

/** Game ids for a league-season = games of league teams whose season's name matches. */
export async function resolveLeagueSeasonGameIds(
  db: SupabaseClient, teamIds: string[], season: string,
): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const { data: seasonRows, error: sErr } = await db
    .from('seasons').select('id').in('team_id', teamIds).eq('name', season);
  if (sErr) throw new Error(`resolve seasons failed: ${sErr.message}`);
  const seasonIds = (seasonRows ?? []).map((r: { id: string }) => r.id);
  if (seasonIds.length === 0) return [];
  const { data: gameRows, error: gErr } = await db
    .from('games').select('id').in('season_id', seasonIds).eq('status', 'completed');
  if (gErr) throw new Error(`resolve games failed: ${gErr.message}`);
  return (gameRows ?? []).map((r: { id: string }) => r.id);
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter web test -- season`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/league-snapshot/season.ts apps/web/src/lib/league-snapshot/__tests__/season.test.ts
git commit -m "feat(web): league season resolver for snapshots"
```

---

### Task 11: Standings computation (pure)

**Files:**
- Create: `apps/web/src/lib/league-snapshot/standings.ts`
- Test: `apps/web/src/lib/league-snapshot/__tests__/standings.test.ts`

> Reuse the home/away perspective logic from `apps/web/src/app/(app)/league/page.tsx` (lines ~50–95). Extract it into this pure function so both the page and the snapshot share one source of truth; the page can be refactored to call this later (out of scope here).

- [ ] **Step 1: Write the failing test**
```typescript
import { computeStandings, type GameRow } from '../standings';

const games: GameRow[] = [
  { team_id: 't1', home_score: 5, away_score: 3, location_type: 'home', neutral_home_team: null, status: 'completed' },
  { team_id: 't1', home_score: 2, away_score: 4, location_type: 'away', neutral_home_team: null, status: 'completed' },
  { team_id: 't2', home_score: 1, away_score: 1, location_type: 'home', neutral_home_team: null, status: 'completed' },
];

describe('computeStandings', () => {
  it('tallies W/L/T and run differential from each team perspective', () => {
    const out = computeStandings(games);
    const t1 = out.get('t1')!;
    expect(t1).toMatchObject({ wins: 2, losses: 0, ties: 0, runsFor: 9, runsAgainst: 5 });
    const t2 = out.get('t2')!;
    expect(t2).toMatchObject({ wins: 0, losses: 0, ties: 1 });
  });
  it('computes win_pct as W/(W+L+T)', () => {
    const out = computeStandings(games);
    expect(out.get('t1')!.winPct).toBeCloseTo(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter web test -- standings`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**
```typescript
// apps/web/src/lib/league-snapshot/standings.ts
export interface GameRow {
  team_id: string;
  home_score: number;
  away_score: number;
  location_type: 'home' | 'away' | 'neutral';
  neutral_home_team: string | null;
  status: string;
}

export interface TeamRecord {
  wins: number; losses: number; ties: number;
  runsFor: number; runsAgainst: number; winPct: number;
}

function weAreHome(g: GameRow): boolean {
  if (g.location_type === 'home') return true;
  if (g.location_type === 'away') return false;
  return g.neutral_home_team === g.team_id; // neutral: explicit flag
}

export function computeStandings(games: GameRow[]): Map<string, TeamRecord> {
  const rec = new Map<string, TeamRecord>();
  for (const g of games) {
    if (g.status !== 'completed') continue;
    const r = rec.get(g.team_id) ?? { wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, winPct: 0 };
    const isHome = weAreHome(g);
    const our = isHome ? g.home_score : g.away_score;
    const their = isHome ? g.away_score : g.home_score;
    r.runsFor += our; r.runsAgainst += their;
    if (our > their) r.wins++; else if (our < their) r.losses++; else r.ties++;
    rec.set(g.team_id, r);
  }
  for (const r of rec.values()) {
    const total = r.wins + r.losses + r.ties;
    r.winPct = total === 0 ? 0 : Number((r.wins / total).toFixed(4));
  }
  return rec;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter web test -- standings`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/league-snapshot/standings.ts apps/web/src/lib/league-snapshot/__tests__/standings.test.ts
git commit -m "feat(web): pure standings computation"
```

---

### Task 12: Season stat aggregation across games (pure)

**Files:**
- Create: `apps/web/src/lib/league-snapshot/aggregate.ts`
- Test: `apps/web/src/lib/league-snapshot/__tests__/aggregate.test.ts`

The reducers (`deriveBattingStats`, etc.) operate per the events handed to them and already accumulate across multiple games when given multi-game event arrays. This module's job is to (a) call each reducer once over the full season event set with the per-game lineup contexts, and (b) shape the resulting `Map`s into snapshot rows, attaching team attribution from lineups and combining batting+pitching+fielding into one `stats` object per player.

- [ ] **Step 1: Write the failing test**
```typescript
import { combinePlayerStats } from '../aggregate';

describe('combinePlayerStats', () => {
  it('merges batting, pitching, fielding maps into one row per player keyed by stat-catalog fields', () => {
    const batting = new Map([['p1', { playerId: 'p1', playerName: 'A B', avg: 0.333, homeRuns: 2, plateAppearances: 30, hits: 10, doubles: 2, triples: 0, runs: 5, rbi: 7, walks: 4, obp: 0.4, slg: 0.5, ops: 0.9, qabPct: 0.5, hardHitPct: 0.3 } as any]]);
    const pitching = new Map([['p1', { playerId: 'p1', era: 2.5, whip: 1.1, strikeouts: 12, inningsPitchedOuts: 21 } as any]]);
    const fielding = new Map();
    const teamOf = new Map([['p1', { teamId: 't1', teamName: 'Reds', firstName: 'A', lastName: 'B', optOut: false }]]);

    const rows = combinePlayerStats({ batting, pitching, fielding, teamOf, leagueId: 'L', season: 'Spring 2026' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      league_id: 'L', season: 'Spring 2026', player_id: 'p1', team_id: 't1',
      team_name: 'Reds', first_name: 'A', last_name: 'B', public_opt_out: false,
      plate_appearances: 30, innings_pitched_outs: 21,
    });
    expect(rows[0].stats).toMatchObject({ avg: 0.333, homeRuns: 2, era: 2.5, whip: 1.1, strikeoutsP: 12 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter web test -- aggregate`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**
```typescript
// apps/web/src/lib/league-snapshot/aggregate.ts
export interface PlayerTeamInfo { teamId: string; teamName: string; firstName: string; lastName: string; optOut: boolean; }

export interface CombineInput {
  batting: Map<string, any>;
  pitching: Map<string, any>;
  fielding: Map<string, any>;
  teamOf: Map<string, PlayerTeamInfo>;
  leagueId: string;
  season: string;
}

export interface PlayerSnapshotRow {
  league_id: string; season: string; player_id: string; team_id: string; team_name: string;
  first_name: string; last_name: string; public_opt_out: boolean;
  stats: Record<string, number>; plate_appearances: number; innings_pitched_outs: number;
}

export function combinePlayerStats(input: CombineInput): PlayerSnapshotRow[] {
  const ids = new Set<string>([...input.batting.keys(), ...input.pitching.keys(), ...input.fielding.keys()]);
  const rows: PlayerSnapshotRow[] = [];
  for (const id of ids) {
    const info = input.teamOf.get(id);
    if (!info) continue; // no team attribution → skip (e.g. unknown-batter stub)
    const b = input.batting.get(id);
    const p = input.pitching.get(id);
    const f = input.fielding.get(id);
    const stats: Record<string, number> = {
      // batting (stat-catalog fields)
      avg: b?.avg ?? 0, obp: b?.obp ?? 0, slg: b?.slg ?? 0, ops: b?.ops ?? 0,
      homeRuns: b?.homeRuns ?? 0, rbi: b?.rbi ?? 0, hits: b?.hits ?? 0, runs: b?.runs ?? 0,
      doubles: b?.doubles ?? 0, triples: b?.triples ?? 0, walks: b?.walks ?? 0,
      qabPct: b?.qabPct ?? 0, hardHitPct: b?.hardHitPct ?? 0,
      // pitching (note: strikeoutsP avoids collision with batting strikeouts)
      era: p?.era ?? 0, whip: p?.whip ?? 0, strikeoutsP: p?.strikeouts ?? 0,
      // fielding
      fieldingPct: f?.fieldingPct ?? 0,
    };
    rows.push({
      league_id: input.leagueId, season: input.season, player_id: id,
      team_id: info.teamId, team_name: info.teamName,
      first_name: info.firstName, last_name: info.lastName, public_opt_out: info.optOut,
      stats,
      plate_appearances: b?.plateAppearances ?? 0,
      innings_pitched_outs: p?.inningsPitchedOuts ?? 0,
    });
  }
  return rows;
}
```
> NOTE: Team-stat aggregation (`teamAvg`, `teamEra`, `runsScored`, `runDiff`) is computed in Task 13 from standings + summed player stats; keep it there to avoid a second pure module unless it grows.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter web test -- aggregate`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/league-snapshot/aggregate.ts apps/web/src/lib/league-snapshot/__tests__/aggregate.test.ts
git commit -m "feat(web): combine per-player stat maps into snapshot rows"
```

---

### Task 13: Recompute orchestrator + upsert

**Files:**
- Create: `apps/web/src/lib/league-snapshot/recompute.ts`

This wires the pieces: load league teams → resolve season game ids → load games/events/lineups/players → run reducers → `combinePlayerStats` → `computeStandings` → derive team stats → derive spotlights (trailing window) → upsert all four snapshot tables. Because it is I/O-heavy, it is verified by a focused integration test against a seeded local DB (Step 2) rather than pure unit tests.

- [ ] **Step 1: Write the implementation**
```typescript
// apps/web/src/lib/league-snapshot/recompute.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveBattingStats, derivePitchingStats, deriveFieldingStats,
  type BattingLineupContext, type FieldingLineupContext,
} from '@baseball/shared';
import { selectSpotlights } from '@baseball/shared';
import { resolveLeagueSeasonGameIds } from './season';
import { computeStandings, type GameRow } from './standings';
import { combinePlayerStats, type PlayerTeamInfo } from './aggregate';

export async function recomputeLeagueSnapshot(
  db: SupabaseClient, leagueId: string, season: string,
): Promise<void> {
  // 1) league team ids
  const { data: members } = await db
    .from('league_members').select('team_id').eq('league_id', leagueId).eq('is_active', true);
  const teamIds = (members ?? []).map((m: { team_id: string | null }) => m.team_id).filter(Boolean) as string[];
  if (teamIds.length === 0) return;

  // 2) games in this league-season
  const gameIds = await resolveLeagueSeasonGameIds(db, teamIds, season);

  // 3) load games, events, lineups, players, league opt-outs, divisions, team names
  const [{ data: games }, { data: events }, { data: lineups }, { data: teams }, { data: divs }, { data: optOuts }] =
    await Promise.all([
      db.from('games').select('id, team_id, home_score, away_score, location_type, neutral_home_team, status, completed_at').in('id', gameIds.length ? gameIds : ['00000000-0000-0000-0000-000000000000']),
      db.from('game_events').select('*').in('game_id', gameIds.length ? gameIds : ['00000000-0000-0000-0000-000000000000']),
      db.from('game_lineups').select('game_id, player_id, team_id, batting_order, starting_position, is_home, count_toward_stats').in('game_id', gameIds.length ? gameIds : ['00000000-0000-0000-0000-000000000000']),
      db.from('teams').select('id, name').in('id', teamIds),
      db.from('league_divisions').select('id, name').eq('league_id', leagueId),
      db.from('league_players').select('player_id, public_opt_out').eq('league_id', leagueId),
    ]);

  const teamName = new Map((teams ?? []).map((t: any) => [t.id, t.name]));
  const optOut = new Map((optOuts ?? []).map((o: any) => [o.player_id, o.public_opt_out]));

  // 4) players referenced by lineups (id, firstName, lastName) for reducer name maps
  const playerIds = Array.from(new Set((lineups ?? []).map((l: any) => l.player_id)));
  const { data: playerRows } = await db.from('players').select('id, first_name, last_name, team_id').in('id', playerIds.length ? playerIds : ['00000000-0000-0000-0000-000000000000']);
  const players = (playerRows ?? []).map((p: any) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name }));

  // 5) lineup contexts per game (batting + fielding) honoring count_toward_stats
  const battingCtx = new Map<string, BattingLineupContext>();
  const fieldingCtx = new Map<string, FieldingLineupContext>();
  const teamOf = new Map<string, PlayerTeamInfo>();
  const byGame = new Map<string, any[]>();
  for (const l of lineups ?? []) {
    if (!byGame.has(l.game_id)) byGame.set(l.game_id, []);
    byGame.get(l.game_id)!.push(l);
    const pr = (playerRows ?? []).find((p: any) => p.id === l.player_id);
    if (pr) teamOf.set(l.player_id, {
      teamId: l.team_id, teamName: teamName.get(l.team_id) ?? '', firstName: pr.first_name, lastName: pr.last_name, optOut: optOut.get(l.player_id) ?? false,
    });
  }
  for (const [gameId, ls] of byGame) {
    const excluded = new Set(ls.filter((l) => l.count_toward_stats === false).map((l) => l.player_id));
    const isHome = ls[0]?.is_home ?? true;
    battingCtx.set(gameId, { ourLineup: ls.map((l) => ({ playerId: l.player_id, battingOrder: l.batting_order })), isHome, excludedPlayerIds: excluded });
    fieldingCtx.set(gameId, { isHome, startingPositions: new Map(ls.filter((l) => l.starting_position != null).map((l) => [Number(l.starting_position), l.player_id])) });
  }

  const evts = (events ?? []) as any[];
  const batting = deriveBattingStats(evts, players, battingCtx);
  const pitching = derivePitchingStats(evts, players);
  const fielding = deriveFieldingStats(evts, players, fieldingCtx);

  const playerRowsOut = combinePlayerStats({ batting, pitching, fielding, teamOf, leagueId, season });

  // 6) standings
  const standings = computeStandings((games ?? []) as GameRow[]);

  // 7) team stats (runsScored/runDiff from standings; teamAvg/teamEra from player sums)
  const teamStatRows = Array.from(standings.entries()).map(([teamId, rec]) => ({
    league_id: leagueId, season, team_id: teamId, team_name: teamName.get(teamId) ?? '',
    stats: {
      runsScored: rec.runsFor,
      runDiff: rec.runsFor - rec.runsAgainst,
      teamAvg: teamRate(playerRowsOut, teamId, 'hits', 'plate_appearances'),
      teamEra: 0, // earned runs not summed here; left 0 until team ERA source confirmed (see RISK)
    },
  }));

  const standingRows = Array.from(standings.entries()).map(([teamId, rec]) => ({
    league_id: leagueId, season, team_id: teamId, division_id: null,
    team_name: teamName.get(teamId) ?? '', wins: rec.wins, losses: rec.losses, ties: rec.ties,
    runs_for: rec.runsFor, runs_against: rec.runsAgainst, win_pct: rec.winPct, streak: '',
  }));

  // 8) spotlights (trailing window): composite score = ops*plate_appearances proxy
  const batters = playerRowsOut.filter((r) => !r.public_opt_out).map((r) => ({
    id: r.player_id, name: `${r.first_name} ${r.last_name}`, teamName: r.team_name,
    score: (r.stats.ops ?? 0) * Math.min(r.plate_appearances, 50), qualifierValue: r.plate_appearances,
  }));
  const teamCand = teamStatRows.map((t) => ({ id: t.team_id, name: t.team_name, score: t.stats.runDiff, qualifierValue: 1 }));
  const spot = selectSpotlights({ batters, teams: teamCand, minBatterQualifier: 5 });
  const spotlightRows = [
    spot.playerOfWeek && { league_id: leagueId, season, type: 'player_of_week', subject_id: spot.playerOfWeek.id, subject_name: spot.playerOfWeek.name, team_name: spot.playerOfWeek.teamName ?? null, blurb: 'Top performer', window_days: 7 },
    spot.hotTeam && { league_id: leagueId, season, type: 'hot_team', subject_id: spot.hotTeam.id, subject_name: spot.hotTeam.name, team_name: null, blurb: 'Best run differential', window_days: 7 },
  ].filter(Boolean) as any[];

  // 9) upsert all four (delete-then-insert per league+season for simplicity & correctness)
  await db.from('league_player_stat_snapshot').delete().eq('league_id', leagueId).eq('season', season);
  await db.from('league_standings_snapshot').delete().eq('league_id', leagueId).eq('season', season);
  await db.from('league_team_stat_snapshot').delete().eq('league_id', leagueId).eq('season', season);
  await db.from('league_spotlight_snapshot').delete().eq('league_id', leagueId).eq('season', season);
  if (playerRowsOut.length) await db.from('league_player_stat_snapshot').insert(playerRowsOut);
  if (standingRows.length) await db.from('league_standings_snapshot').insert(standingRows);
  if (teamStatRows.length) await db.from('league_team_stat_snapshot').insert(teamStatRows);
  if (spotlightRows.length) await db.from('league_spotlight_snapshot').insert(spotlightRows);
}

function teamRate(rows: { team_id: string; stats: Record<string, number>; plate_appearances: number }[], teamId: string, numField: string, denField: 'plate_appearances'): number {
  const team = rows.filter((r) => r.team_id === teamId);
  const num = team.reduce((s, r) => s + (r.stats[numField] ?? 0), 0);
  const den = team.reduce((s, r) => s + (r[denField] ?? 0), 0);
  return den === 0 ? 0 : Number((num / den).toFixed(3));
}
```
> **VERIFY before running:** (a) `game_lineups` must actually expose `is_home` and `team_id`; the explore confirmed `team_id` is added by `20260523*` and `count_toward_stats`/`is_guest` by `20260522000003`. If `is_home` is absent, derive it from the game's `location_type` join instead. (b) Confirm reducer exports (`BattingLineupContext`, `FieldingLineupContext`) are re-exported from `@baseball/shared` root; if not, import from `@baseball/shared/dist/...` path used elsewhere. (c) **RISK:** team ERA needs an earned-runs source — left as 0 with a TODO; surface to the user (see plan "Open items").

- [ ] **Step 2: Integration check against seeded DB**
Run: `supabase db reset && supabase start` then a one-off script (ts-node) that calls `recomputeLeagueSnapshot(serviceRoleDb, '<seeded-league-id>', '<season>')` and selects from `league_player_stat_snapshot`.
Expected: rows inserted for the seeded league; no throw. (If `seed.sql` lacks a league with completed games, add a minimal seed fixture in this step and commit it.)

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/lib/league-snapshot/recompute.ts
git commit -m "feat(web): league snapshot recompute orchestrator"
```

---

### Task 14: Trigger recompute on game finalize

**Files:**
- Modify: `apps/web/src/app/(app)/games/[gameId]/actions.ts` (the server action that sets a game to `completed`)

- [ ] **Step 1: Read the existing finalize action**
Open `apps/web/src/app/(app)/games/[gameId]/actions.ts`; locate the action that updates `games.status = 'completed'` (grep `'completed'`).

- [ ] **Step 2: Add a fire-and-forget recompute after successful finalize**
After the successful status update, insert:
```typescript
import { createClient } from '@supabase/supabase-js';
import { recomputeLeagueSnapshot } from '@/lib/league-snapshot/recompute';
import { listLeagueSeasons } from '@/lib/league-snapshot/season';

// ...after the game is marked completed and we have its team_id + season name:
try {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  // find the league this team belongs to
  const { data: lm } = await svc.from('league_members').select('league_id').eq('team_id', game.team_id).eq('is_active', true).maybeSingle();
  if (lm?.league_id) {
    // season name from the finalized game's season
    const { data: s } = await svc.from('seasons').select('name').eq('id', game.season_id).maybeSingle();
    if (s?.name) await recomputeLeagueSnapshot(svc, lm.league_id, s.name);
  }
} catch (err) {
  console.error(`[finalize] snapshot recompute failed game=${game.id}: ${err instanceof Error ? err.message : String(err)}`);
  // non-fatal: the scheduled rebuild (Task 15) will self-heal
}
```
> Adapt variable names (`game.team_id`, `game.season_id`, `game.id`) to whatever the action already has in scope.

- [ ] **Step 3: Type-check**
Run: `pnpm --filter web type-check`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/app/\(app\)/games/\[gameId\]/actions.ts
git commit -m "feat(web): recompute league snapshot on game finalize"
```

---

### Task 15: Scheduled safety-net rebuild (cron route)

**Files:**
- Create: `apps/web/src/app/api/cron/rebuild-league-snapshots/route.ts`
- Modify/Create: `apps/web/vercel.json`

- [ ] **Step 1: Write the route handler**
```typescript
// apps/web/src/app/api/cron/rebuild-league-snapshots/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recomputeLeagueSnapshot } from '@/lib/league-snapshot/recompute';
import { listLeagueSeasons } from '@/lib/league-snapshot/season';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: leagues, error } = await db.from('leagues').select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rebuilt = 0;
  for (const lg of leagues ?? []) {
    const { data: members } = await db.from('league_members').select('team_id').eq('league_id', lg.id).eq('is_active', true);
    const teamIds = (members ?? []).map((m: { team_id: string | null }) => m.team_id).filter(Boolean) as string[];
    const seasons = await listLeagueSeasons(db, teamIds);
    for (const season of seasons) {
      try { await recomputeLeagueSnapshot(db, lg.id, season); rebuilt++; }
      catch (err) { console.error(`[cron] rebuild failed league=${lg.id} season=${season}: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }
  return NextResponse.json({ ok: true, rebuilt });
}
```

- [ ] **Step 2: Configure the cron schedule**
Add to `apps/web/vercel.json` (create if missing):
```json
{
  "crons": [
    { "path": "/api/cron/rebuild-league-snapshots", "schedule": "0 */6 * * *" }
  ]
}
```
Document `CRON_SECRET` in `apps/web/.env.example` and the root `.env.example` table. Update `CLAUDE.md` Environment Variables table with `CRON_SECRET` (server-only).

- [ ] **Step 3: Type-check**
Run: `pnpm --filter web type-check`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/app/api/cron/rebuild-league-snapshots/route.ts apps/web/vercel.json apps/web/.env.example .env.example CLAUDE.md
git commit -m "feat(web): scheduled safety-net league snapshot rebuild"
```

---

# PHASE 3 — Public page

### Task 16: Allow `/l/` as a public route in middleware

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Add a public-route bypass before the protected-route redirect**
Just before the `isProtectedRoute` block, insert:
```typescript
const isPublicRoute = pathname.startsWith('/l/');
if (isPublicRoute) {
  return supabaseResponse; // public league home; no auth redirect
}
```
> Confirm the variable returned elsewhere in this middleware is named `supabaseResponse`; if it is `response`, match that.

- [ ] **Step 2: Type-check**
Run: `pnpm --filter web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/middleware.ts
git commit -m "feat(web): allow public /l/[slug] route in middleware"
```

---

### Task 17: Public-page data loader

**Files:**
- Create: `apps/web/src/lib/league-home/load.ts`
- Test: `apps/web/src/lib/league-home/__tests__/load.test.ts`

The loader reads snapshots via service role, applies visibility gating and name masking, and assembles default + custom leaderboards using the shared `buildLeaderboard` + `STAT_CATALOG`.

- [ ] **Step 1: Write the failing test (masking + visibility logic, pure parts)**
```typescript
import { toLeaderRows, resolveVisibility } from '../load';

describe('league-home load helpers', () => {
  it('masks names for public viewers and excludes opted-out players', () => {
    const snap = [
      { player_id: 'p1', first_name: 'Alex', last_name: 'Ramirez', public_opt_out: false, team_name: 'Reds', stats: { avg: .35 }, plate_appearances: 30, innings_pitched_outs: 0 },
      { player_id: 'p2', first_name: 'Sam', last_name: 'Lee', public_opt_out: true, team_name: 'Jays', stats: { avg: .40 }, plate_appearances: 30, innings_pitched_outs: 0 },
    ];
    const rows = toLeaderRows(snap as any, 'avg', /*isAuthed*/ false);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alex R.');
  });
  it('shows full names to authed members and keeps opted-out players', () => {
    const snap = [{ player_id: 'p2', first_name: 'Sam', last_name: 'Lee', public_opt_out: true, team_name: 'Jays', stats: { avg: .40 }, plate_appearances: 30, innings_pitched_outs: 0 }];
    const rows = toLeaderRows(snap as any, 'avg', true);
    expect(rows[0].name).toBe('Sam Lee');
  });
  it('resolveVisibility blocks anon on signed_in leagues', () => {
    expect(resolveVisibility('signed_in', false)).toBe('blocked');
    expect(resolveVisibility('signed_in', true)).toBe('ok');
    expect(resolveVisibility('public', false)).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter web test -- load`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**
```typescript
// apps/web/src/lib/league-home/load.ts
import { createClient } from '@supabase/supabase-js';
import { buildLeaderboard, getStatDef, STAT_CATALOG, publicDisplayName, memberDisplayName, mergeWithThemeDefaults, leagueLeaderConfigSchema, type LeaderRow } from '@baseball/shared';

export function resolveVisibility(visibility: string, isAuthed: boolean): 'ok' | 'blocked' {
  if (visibility === 'signed_in' && !isAuthed) return 'blocked';
  return 'ok';
}

export function toLeaderRows(snap: any[], statKey: string, isAuthed: boolean): LeaderRow[] {
  const def = getStatDef(statKey as any);
  return snap
    .filter((r) => isAuthed || !r.public_opt_out)
    .map((r) => ({
      id: r.player_id,
      name: isAuthed
        ? memberDisplayName({ firstName: r.first_name, lastName: r.last_name })
        : publicDisplayName({ firstName: r.first_name, lastName: r.last_name }),
      teamName: r.team_name,
      value: Number(r.stats?.[def.field] ?? 0),
      qualifierValue: def.qualifier === 'ip' ? r.innings_pitched_outs : r.plate_appearances,
    }));
}

const DEFAULT_PLAYER_BOARDS = ['avg', 'homeRuns', 'rbi', 'hits', 'runs', 'obp', 'ops'];
const DEFAULT_PITCHING_BOARDS = ['era', 'whip', 'strikeoutsP'];
const DEFAULT_TEAM_BOARDS = ['teamAvg', 'teamEra', 'runsScored', 'runDiff'];

export async function getLeagueHomeData(slug: string, isAuthed: boolean, seasonParam?: string) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: league } = await db.from('leagues').select('*').eq('slug', slug).maybeSingle();
  if (!league) return { notFound: true as const };
  if (resolveVisibility(league.visibility, isAuthed) === 'blocked') {
    return { blocked: true as const, league: { name: league.name } };
  }
  const season = seasonParam ?? league.current_season ?? '';
  const theme = mergeWithThemeDefaults(league.home_theme);
  const leaderConfig = leagueLeaderConfigSchema.parse(league.leader_config ?? {});

  const [{ data: standings }, { data: playerSnap }, { data: teamSnap }, { data: spots }] = await Promise.all([
    db.from('league_standings_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_player_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_team_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_spotlight_snapshot').select('*').eq('league_id', league.id).eq('season', season),
  ]);

  const minPa = leaderConfig.qualifierOverrides.paPerGame ?? 0; // games-played scaling resolved in page; simple floor here
  const board = (statKey: string, limit = 10) => {
    const def = getStatDef(statKey as any);
    const rows = def.subject === 'team'
      ? (teamSnap ?? []).map((t: any) => ({ id: t.team_id, name: t.team_name, value: Number(t.stats?.[def.field] ?? 0), qualifierValue: 1 }))
      : toLeaderRows(playerSnap ?? [], statKey, isAuthed);
    return { def, rows: buildLeaderboard(rows, def, { minQualifier: def.qualifier === 'none' ? 0 : minPa, limit }) };
  };

  return {
    ok: true as const,
    league: { id: league.id, name: league.name, logoUrl: league.logo_url, visibility: league.visibility },
    theme, season,
    standings: (standings ?? []).sort((a: any, b: any) => b.win_pct - a.win_pct),
    defaultBoards: { batting: DEFAULT_PLAYER_BOARDS.map((k) => board(k)), pitching: DEFAULT_PITCHING_BOARDS.map((k) => board(k)), team: DEFAULT_TEAM_BOARDS.map((k) => board(k)) },
    customBoards: leaderConfig.custom.map((c) => ({ label: c.label, ...board(c.statKey, c.limit) })),
    spotlights: spots ?? [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter web test -- load`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/league-home/load.ts apps/web/src/lib/league-home/__tests__/load.test.ts
git commit -m "feat(web): league home data loader with visibility + masking"
```

---

### Task 18: Public page components

**Files:**
- Create: `apps/web/src/app/l/[slug]/_components/Hero.tsx`
- Create: `apps/web/src/app/l/[slug]/_components/StandingsTable.tsx`
- Create: `apps/web/src/app/l/[slug]/_components/LeaderBoard.tsx`
- Create: `apps/web/src/app/l/[slug]/_components/RecentUpcoming.tsx`
- Create: `apps/web/src/app/l/[slug]/_components/Spotlights.tsx`

These are presentational server components (no `'use client'`). Use existing Tailwind primitives (`Card`, `Badge`) from `@/components/ui` where available.

- [ ] **Step 1: Write `LeaderBoard.tsx` (representative; others follow the same shape)**
```tsx
// apps/web/src/app/l/[slug]/_components/LeaderBoard.tsx
import type { RankedLeaderRow } from '@baseball/shared';

export function LeaderBoard({ title, rows, format }: { title: string; rows: RankedLeaderRow[]; format: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No qualified leaders yet.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span><span className="inline-block w-6 text-slate-400">{r.rank}</span>{r.name}{r.teamName ? <span className="ml-1 text-slate-400">· {r.teamName}</span> : null}</span>
              <span className="font-mono font-semibold">{formatStat(r.value, format)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatStat(v: number, format: string): string {
  switch (format) {
    case 'avg3': return v.toFixed(3).replace(/^0/, '');
    case 'pct1': return `${(v * 100).toFixed(1)}%`;
    case 'ratio2': return v.toFixed(2);
    case 'int': return String(Math.round(v));
    default: return String(v);
  }
}
```

- [ ] **Step 2: Write `Hero.tsx`, `StandingsTable.tsx`, `RecentUpcoming.tsx`, `Spotlights.tsx`**
```tsx
// Hero.tsx
export function Hero({ name, logoUrl, theme, counters }: { name: string; logoUrl: string | null; theme: { accentColor: string; bannerUrl: string | null; heroTitle: string; heroTagline: string }; counters: { teams: number; games: number; season: string } }) {
  return (
    <header className="rounded-xl p-8 text-white" style={{ background: theme.bannerUrl ? `url(${theme.bannerUrl}) center/cover` : theme.accentColor }}>
      <div className="flex items-center gap-4">
        {logoUrl ? <img src={logoUrl} alt="" className="h-16 w-16 rounded-full bg-white/20" /> : null}
        <div>
          <h1 className="text-3xl font-bold">{theme.heroTitle || name}</h1>
          {theme.heroTagline ? <p className="opacity-90">{theme.heroTagline}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex gap-6 text-sm opacity-90">
        <span>{counters.teams} teams</span><span>{counters.games} games</span><span>{counters.season}</span>
      </div>
    </header>
  );
}
```
```tsx
// StandingsTable.tsx
export function StandingsTable({ rows }: { rows: Array<{ team_id: string; team_name: string; wins: number; losses: number; ties: number; win_pct: number; runs_for: number; runs_against: number }> }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-slate-500"><th>Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th><th>RF</th><th>RA</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.team_id} className="border-t border-slate-100"><td className="py-1">{r.team_name}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.ties}</td><td>{r.win_pct.toFixed(3).replace(/^0/, '')}</td><td>{r.runs_for}</td><td>{r.runs_against}</td></tr>
      ))}</tbody>
    </table>
  );
}
```
```tsx
// RecentUpcoming.tsx
export function RecentUpcoming({ recent, upcoming }: { recent: Array<{ id: string; label: string }>; upcoming: Array<{ id: string; label: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div><h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Recent Results</h3>{recent.length ? recent.map((g) => <p key={g.id} className="text-sm">{g.label}</p>) : <p className="text-sm text-slate-400">No results yet.</p>}</div>
      <div><h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Upcoming</h3>{upcoming.length ? upcoming.map((g) => <p key={g.id} className="text-sm">{g.label}</p>) : <p className="text-sm text-slate-400">Nothing scheduled.</p>}</div>
    </div>
  );
}
```
```tsx
// Spotlights.tsx
export function Spotlights({ items }: { items: Array<{ type: string; subject_name: string; team_name: string | null; blurb: string }> }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((s) => (
        <div key={s.type} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase text-amber-600">{s.type === 'player_of_week' ? 'Player of the Week' : 'Hot Team'}</p>
          <p className="text-lg font-bold">{s.subject_name}</p>
          {s.team_name ? <p className="text-sm text-slate-500">{s.team_name}</p> : null}
          <p className="text-sm">{s.blurb}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**
Run: `pnpm --filter web type-check`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/app/l/\[slug\]/_components
git commit -m "feat(web): league home presentational components"
```

---

### Task 19: Public page composition + visibility gate + season switcher + SEO metadata

**Files:**
- Create: `apps/web/src/app/l/[slug]/page.tsx`

- [ ] **Step 1: Write the page**
```tsx
// apps/web/src/app/l/[slug]/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueHomeData } from '@/lib/league-home/load';
import { Hero } from './_components/Hero';
import { StandingsTable } from './_components/StandingsTable';
import { LeaderBoard } from './_components/LeaderBoard';
import { RecentUpcoming } from './_components/RecentUpcoming';
import { Spotlights } from './_components/Spotlights';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  const data = await getLeagueHomeData(params.slug, !!user);
  if ('notFound' in data) return { title: 'League not found' };
  if ('blocked' in data) return { title: data.league.name, robots: { index: false, follow: false } };
  return {
    title: `${data.league.name} — Standings & Leaders`,
    description: `${data.league.name} standings, statistical leaders, and results.`,
    robots: data.league.visibility === 'public' ? undefined : { index: false, follow: false },
  };
}

export default async function LeagueHomePage({ params, searchParams }: { params: { slug: string }; searchParams: { season?: string } }) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  const data = await getLeagueHomeData(params.slug, !!user, searchParams.season);

  if ('notFound' in data) notFound();
  if ('blocked' in data) {
    return (
      <main className="mx-auto max-w-md p-12 text-center">
        <h1 className="text-2xl font-bold">{data.league.name}</h1>
        <p className="mt-2 text-slate-600">This league is visible to signed-in users only.</p>
        <a href={`/login?redirectTo=/l/${params.slug}`} className="mt-4 inline-block rounded bg-slate-900 px-4 py-2 text-white">Sign in</a>
      </main>
    );
  }

  const sectionEnabled = (id: string) => data.theme.sections.find((s) => s.id === id)?.enabled ?? true;

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      {sectionEnabled('hero') && (
        <Hero name={data.league.name} logoUrl={data.league.logoUrl} theme={data.theme}
          counters={{ teams: data.standings.length, games: data.standings.reduce((s, r) => s + r.wins + r.losses + r.ties, 0) / 2 | 0, season: data.season || '—' }} />
      )}
      {sectionEnabled('standings') && (
        <section><h2 className="mb-3 text-xl font-bold">Standings</h2><StandingsTable rows={data.standings} /></section>
      )}
      {sectionEnabled('spotlights') && <Spotlights items={data.spotlights} />}
      {sectionEnabled('leaders') && (
        <section>
          <h2 className="mb-3 text-xl font-bold">League Leaders</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[...data.defaultBoards.batting, ...data.defaultBoards.pitching, ...data.defaultBoards.team].map((b) => (
              <LeaderBoard key={b.def.key} title={b.def.label} rows={b.rows} format={b.def.format} />
            ))}
          </div>
        </section>
      )}
      {sectionEnabled('customLeaders') && data.customBoards.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Special Categories</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.customBoards.map((b, i) => <LeaderBoard key={i} title={b.label} rows={b.rows} format={b.def.format} />)}
          </div>
        </section>
      )}
    </main>
  );
}
```
> RecentUpcoming wiring: add a `recent`/`upcoming` fetch to `getLeagueHomeData` (games of league teams ordered by `scheduled_at`, split on `status`) and render `<RecentUpcoming />` under a `sectionEnabled('recent')` guard. Kept out of the snippet for brevity — implement as a follow-on edit in this task and include in the commit.

- [ ] **Step 2: Manual smoke test**
Run: `pnpm dev:web`, then visit `http://localhost:3000/l/<seeded-slug>` (logged out) and a `signed_in` league logged out (should show the sign-in gate).
Expected: public league renders standings/leaders; signed-in-only league shows the gate.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/l/\[slug\]/page.tsx apps/web/src/lib/league-home/load.ts
git commit -m "feat(web): public league home page with visibility gate + SEO"
```

---

### Task 20: Open Graph share image

**Files:**
- Create: `apps/web/src/app/l/[slug]/opengraph-image.tsx`

- [ ] **Step 1: Write the OG image route**
```tsx
// apps/web/src/app/l/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { getLeagueHomeData } from '@/lib/league-home/load';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Og({ params }: { params: { slug: string } }) {
  const data = await getLeagueHomeData(params.slug, false);
  const name = 'ok' in data ? data.league.name : ('blocked' in data ? data.league.name : 'League');
  const accent = 'ok' in data ? data.theme.accentColor : '#1e90ff';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: accent, color: 'white', fontSize: 64, fontWeight: 700 }}>
        <div>{name}</div>
        <div style={{ fontSize: 28, fontWeight: 400, marginTop: 16 }}>Standings &amp; League Leaders</div>
      </div>
    ),
    { ...size },
  );
}
```
> If a `signed_in` league should not leak its name in a share card, return a generic title when `'blocked' in data`. Confirm desired behavior with the user; default here shows the name.

- [ ] **Step 2: Smoke test**
Visit `http://localhost:3000/l/<seeded-slug>/opengraph-image`.
Expected: a 1200×630 PNG renders.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/l/\[slug\]/opengraph-image.tsx
git commit -m "feat(web): league home Open Graph share image"
```

---

# PHASE 4 — Admin settings

### Task 21: Home-settings API route

**Files:**
- Create: `apps/web/src/app/api/league/home-settings/route.ts`

Mirrors `api/league/scoring-settings/route.ts` exactly (auth → service-role → league_admin check → Zod validate → update → respond), validating `visibility`, `slug` (uniqueness), `home_theme`, `leader_config`.

- [ ] **Step 1: Write the route**
```typescript
// apps/web/src/app/api/league/home-settings/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { leagueHomeThemeSchema, leagueLeaderConfigSchema } from '@baseball/shared';
import { z } from 'zod';

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase kebab-case only').min(3).max(60);
const bodySchema = z.object({
  leagueId: z.string().uuid(),
  visibility: z.enum(['public', 'signed_in']),
  slug: slugSchema,
  homeTheme: leagueHomeThemeSchema,
  leaderConfig: leagueLeaderConfigSchema,
});

export async function POST(request: NextRequest) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues }, { status: 400 });
  const { leagueId, visibility, slug, homeTheme, leaderConfig } = parsed.data;

  const { data: staffRow, error: staffErr } = await db
    .from('league_staff').select('role').eq('league_id', leagueId).eq('user_id', user.id).eq('is_active', true).eq('role', 'league_admin').maybeSingle();
  if (staffErr) return NextResponse.json({ error: 'Server error' }, { status: 500 });
  if (!staffRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // slug uniqueness (excluding this league)
  const { data: clash } = await db.from('leagues').select('id').eq('slug', slug).neq('id', leagueId).maybeSingle();
  if (clash) return NextResponse.json({ error: 'That URL slug is already taken' }, { status: 409 });

  const { data: updated, error: updErr } = await db
    .from('leagues').update({ visibility, slug, home_theme: homeTheme, leader_config: leaderConfig }).eq('id', leagueId).select('id');
  if (updErr) return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**
Run: `pnpm --filter web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/api/league/home-settings/route.ts
git commit -m "feat(web): league home-settings API route"
```

---

### Task 22: Player opt-out API route

**Files:**
- Create: `apps/web/src/app/api/league/player-opt-out/route.ts`

- [ ] **Step 1: Write the route**
```typescript
// apps/web/src/app/api/league/player-opt-out/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const bodySchema = z.object({ leagueId: z.string().uuid(), playerId: z.string().uuid(), optOut: z.boolean() });

export async function POST(request: NextRequest) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { leagueId, playerId, optOut } = parsed.data;

  const { data: staffRow } = await db.from('league_staff').select('role').eq('league_id', leagueId).eq('user_id', user.id).eq('is_active', true).eq('role', 'league_admin').maybeSingle();
  if (!staffRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await db.from('league_players').update({ public_opt_out: optOut }).eq('league_id', leagueId).eq('player_id', playerId);
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check & commit**
Run: `pnpm --filter web type-check` → PASS.
```bash
git add apps/web/src/app/api/league/player-opt-out/route.ts
git commit -m "feat(web): player public opt-out API route"
```

---

### Task 23: Custom categories editor (client component)

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/CustomCategoriesEditor.tsx`

- [ ] **Step 1: Write the component**
```tsx
'use client';
import { useState } from 'react';
import { STAT_CATALOG, type LeagueLeaderConfig, type CustomCategory } from '@baseball/shared';

export function CustomCategoriesEditor({ value, onChange }: { value: LeagueLeaderConfig; onChange: (next: LeagueLeaderConfig) => void }) {
  const [custom, setCustom] = useState<CustomCategory[]>(value.custom);

  function update(next: CustomCategory[]) { setCustom(next); onChange({ ...value, custom: next }); }
  function add() { if (custom.length >= 5) return; update([...custom, { statKey: STAT_CATALOG[0].key, label: STAT_CATALOG[0].label, limit: 10 }]); }
  function remove(i: number) { update(custom.filter((_, idx) => idx !== i)); }
  function edit(i: number, patch: Partial<CustomCategory>) { update(custom.map((c, idx) => (idx === i ? { ...c, ...patch } : c))); }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Add up to 5 custom leader boards ({custom.length}/5).</p>
      {custom.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <select className="rounded border px-2 py-1" value={c.statKey} onChange={(e) => { const def = STAT_CATALOG.find((s) => s.key === e.target.value)!; edit(i, { statKey: def.key, label: c.label || def.label }); }}>
            {STAT_CATALOG.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.subject})</option>)}
          </select>
          <input className="rounded border px-2 py-1" value={c.label} onChange={(e) => edit(i, { label: e.target.value })} placeholder="Display label" />
          <input className="w-20 rounded border px-2 py-1" type="number" min={3} max={25} value={c.limit} onChange={(e) => edit(i, { limit: Number(e.target.value) })} />
          <button type="button" className="text-red-600" onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button type="button" disabled={custom.length >= 5} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-40" onClick={add}>Add category</button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check & commit**
Run: `pnpm --filter web type-check` → PASS.
```bash
git add apps/web/src/app/\(app\)/league/admin/CustomCategoriesEditor.tsx
git commit -m "feat(web): custom leader categories editor"
```

---

### Task 24: Home-page settings form (client component)

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/HomePageSettingsForm.tsx`

Mirrors `LeagueScoringSettingsForm.tsx` (client component, `useState`, POST, `router.refresh()`), composing the theme fields + `CustomCategoriesEditor`.

- [ ] **Step 1: Write the component**
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { mergeWithThemeDefaults, leagueLeaderConfigSchema, ALL_SECTIONS, type LeagueHomeTheme, type LeagueLeaderConfig } from '@baseball/shared';
import { CustomCategoriesEditor } from './CustomCategoriesEditor';

interface Props {
  leagueId: string; canEdit: boolean;
  initialVisibility: 'public' | 'signed_in'; initialSlug: string;
  initialTheme: unknown; initialLeaderConfig: unknown;
}

export function HomePageSettingsForm({ leagueId, canEdit, initialVisibility, initialSlug, initialTheme, initialLeaderConfig }: Props): JSX.Element {
  const router = useRouter();
  const [visibility, setVisibility] = useState<'public' | 'signed_in'>(initialVisibility);
  const [slug, setSlug] = useState(initialSlug);
  const [theme, setTheme] = useState<LeagueHomeTheme>(() => mergeWithThemeDefaults(initialTheme));
  const [leaderConfig, setLeaderConfig] = useState<LeagueLeaderConfig>(() => leagueLeaderConfigSchema.parse(initialLeaderConfig ?? {}));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true); setErrorMsg(null); setSavedAt(null);
    try {
      const res = await fetch('/api/league/home-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, visibility, slug, homeTheme: theme, leaderConfig }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) { setErrorMsg(data.error ?? `Save failed (${res.status})`); return; }
      setSavedAt(new Date().toLocaleTimeString()); router.refresh();
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  function setSection(id: string, enabled: boolean) {
    setTheme((t) => ({ ...t, sections: t.sections.map((s) => (s.id === id ? { ...s, enabled } : s)) }));
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="font-semibold">Visibility</legend>
        <label className="mr-4"><input type="radio" checked={visibility === 'public'} onChange={() => setVisibility('public')} disabled={!canEdit} /> Public</label>
        <label><input type="radio" checked={visibility === 'signed_in'} onChange={() => setVisibility('signed_in')} disabled={!canEdit} /> Signed In Users Only</label>
      </fieldset>

      <label className="block">Public URL slug
        <div className="flex items-center gap-1"><span className="text-slate-400">/l/</span>
          <input className="rounded border px-2 py-1" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canEdit} /></div>
      </label>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Theme</legend>
        <label className="mr-4">Accent <input type="color" value={theme.accentColor} onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })} disabled={!canEdit} /></label>
        <label className="mr-4">Secondary <input type="color" value={theme.secondaryColor} onChange={(e) => setTheme({ ...theme, secondaryColor: e.target.value })} disabled={!canEdit} /></label>
        <input className="block w-full rounded border px-2 py-1" placeholder="Banner image URL" value={theme.bannerUrl ?? ''} onChange={(e) => setTheme({ ...theme, bannerUrl: e.target.value || null })} disabled={!canEdit} />
        <input className="block w-full rounded border px-2 py-1" placeholder="Hero title" value={theme.heroTitle} onChange={(e) => setTheme({ ...theme, heroTitle: e.target.value })} disabled={!canEdit} />
        <input className="block w-full rounded border px-2 py-1" placeholder="Hero tagline" value={theme.heroTagline} onChange={(e) => setTheme({ ...theme, heroTagline: e.target.value })} disabled={!canEdit} />
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="font-semibold">Sections</legend>
        {ALL_SECTIONS.map((id) => (
          <label key={id} className="mr-4 inline-block"><input type="checkbox" checked={theme.sections.find((s) => s.id === id)?.enabled ?? true} onChange={(e) => setSection(id, e.target.checked)} disabled={!canEdit} /> {id}</label>
        ))}
      </fieldset>

      <fieldset><legend className="font-semibold">Custom leader categories</legend>
        <CustomCategoriesEditor value={leaderConfig} onChange={setLeaderConfig} />
      </fieldset>

      {errorMsg ? <p className="text-red-600">{errorMsg}</p> : null}
      {savedAt ? <p className="text-green-600">Saved at {savedAt}</p> : null}
      <button type="submit" disabled={!canEdit || saving} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save home page settings'}</button>
    </form>
  );
}
```

- [ ] **Step 2: Type-check & commit**
Run: `pnpm --filter web type-check` → PASS.
```bash
git add apps/web/src/app/\(app\)/league/admin/HomePageSettingsForm.tsx
git commit -m "feat(web): league home-page settings form"
```

---

### Task 25: Mount the settings panel + player opt-out list in the admin page

**Files:**
- Modify: `apps/web/src/app/(app)/league/admin/page.tsx`

- [ ] **Step 1: Load the league's current home fields and render the form**
In the admin page server component, after the existing league + access load, fetch the relevant columns and render:
```tsx
import { HomePageSettingsForm } from './HomePageSettingsForm';
// ...
// league row already loaded as `league`; access.isLeagueAdmin already computed.
<section className="mt-8">
  <h2 className="text-xl font-bold">Home Page</h2>
  <p className="text-sm text-slate-500">Public address: <a className="underline" href={`/l/${league.slug}`}>/l/{league.slug}</a></p>
  <HomePageSettingsForm
    leagueId={league.id}
    canEdit={access.isLeagueAdmin}
    initialVisibility={(league.visibility ?? 'public') as 'public' | 'signed_in'}
    initialSlug={league.slug}
    initialTheme={league.home_theme}
    initialLeaderConfig={league.leader_config}
  />
</section>
```
> Ensure the admin page's league query selects `slug, visibility, home_theme, leader_config` (extend the existing `.select(...)`).

- [ ] **Step 2: Smoke test**
Run: `pnpm dev:web`, sign in as a league admin, open `/league/admin`, change visibility/slug/theme/custom categories, Save. Confirm the public `/l/[slug]` reflects changes after a game finalize or cron rebuild.
Expected: settings persist; 409 on a duplicate slug; 403 for non-admins.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/\(app\)/league/admin/page.tsx
git commit -m "feat(web): mount league home-page settings in admin"
```

---

## Open items to surface to the user during build (per their "surface issues" instruction)

1. **Team ERA source.** `computeStandings` has runs against, but *earned* runs for team ERA aren't summed in v1 — `teamEra` is left `0`. Options: sum per-pitcher `earnedRunsAllowed` from the player snapshot, or drop the team ERA board. Confirm before finalizing Task 13.
2. **`game_lineups.is_home`.** The recompute assumes a per-lineup home flag. If absent, attribution must join `games.location_type`. Verify against the regenerated types in Task 9.
3. **Qualifier scaling.** Spec said "per team game" minimums; v1 uses a simple PA/IP floor from `qualifierOverrides`. If true per-game scaling is required, multiply by team games played (available from standings) in the loader.
4. **Reducer multi-game behavior.** Confirm `deriveBattingStats` accumulates correctly across a multi-game event array with mixed `game_id`s (Task 13 relies on this). If it expects single-game input, loop per game and sum in `aggregate.ts`.

---

## Self-Review

- **Spec coverage:** public `/l/[slug]` (T16,19) ✓; visibility public/signed_in (T7,17,19) ✓; standings (T11,18,19) ✓; default leaders batting+pitching+team (T1,17,18) ✓; ≤5 custom catalog categories, player/team per slot (T3,17,23,24) ✓; qualifiers w/ admin override (T1,3,17) ✓; snapshot engine + finalize trigger + cron (T13,14,15) ✓; season default+switcher (T10,17,19 — *switcher UI control* is wired via `?season=`; add the dropdown in T19's RecentUpcoming follow-on if not present) ; spotlights (T6,13,18) ✓; theming colors+banner+hero+sections (T2,24) ✓; minor-privacy name masking + opt-out (T4,8,17,22) ✓; SEO + OG (T19,20) ✓.
- **Placeholder scan:** no TBD/TODO left except the explicitly-flagged Open Items (team ERA `0`), which are surfaced deliberately.
- **Type consistency:** stat-catalog `field` keys (Task 1) match the `stats` object written in `aggregate.ts`/`recompute.ts` (Tasks 12–13) and read in `load.ts` (Task 17): `avg, obp, slg, ops, homeRuns, rbi, hits, runs, doubles, triples, walks, qabPct, hardHitPct, era, whip, strikeoutsP, fieldingPct, teamAvg, teamEra, runsScored, runDiff`. `buildLeaderboard` signature is identical across T5/T17.
- **Gap added:** season switcher dropdown UI is a small addition in Task 19; explicitly noted above.
