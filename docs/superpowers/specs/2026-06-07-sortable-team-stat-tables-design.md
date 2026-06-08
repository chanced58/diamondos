# Sortable Team Stat Tables — Design

**Date:** 2026-06-07
**Status:** Approved design, pending spec review
**Branch:** `team-stat-page`
**Builds on:** [`2026-06-07-team-stat-page-design.md`](./2026-06-07-team-stat-page-design.md)

## Problem

The team stat page (`/l/[slug]/team/[teamId]`) renders the roster's batting and
pitching lines in static tables, server-sorted by playing time. Users want to sort
each table by any stat column (click a header to rank by AVG, HR, ERA, etc.).

## Goals

- Every column on the batting and pitching tables is clickable to sort by that column.
- First click sorts "best-first" per the stat's natural direction; second click flips it.
- Sorting is instant, client-side, with no page reload and no URL change.
- The opt-out privacy guarantee is preserved: a public viewer can never recover an
  opted-out player's hidden stat — not through display, sort position, **or the page
  payload**.

## Non-Goals

- URL-shareable / bookmarkable sort state (local UI state only).
- Server-side sorting or pagination (the whole roster is already loaded).
- Sorting the team-level **TeamStatPanel** (a single team — nothing to sort).
- Multi-column / secondary-key sorting beyond the deterministic name tie-break.

## The Privacy Constraint (why this isn't a trivial change)

The batting/pitching tables are currently **server components**. A server component's
props are rendered on the server and never serialized to the browser, so opted-out
players' real `stats` (passed in `players`) never leave the server — the cells render
`—`.

Making a table interactive requires a **client component**, and Next.js **serializes a
client component's props into the browser** (that's how it hydrates). Passing the
current `players` array (with opted-out players' real `stats`) to a client table would
ship those hidden numbers to the browser, readable in devtools — defeating the opt-out.

**Therefore opted-out players' values must be stripped server-side before they cross the
client boundary.** This is the central design decision; everything else follows from it.

## Architecture

### Sanitized player rows (`toTeamPlayerRows`)

`toTeamPlayerRows(snap, isAuthed)` already computes
`optedOut = !isAuthed && public_opt_out`. Extend it so opted-out rows carry **no numeric
data**, plus a participation flag so the pitching table can still list opted-out pitchers
without revealing innings:

```ts
export interface TeamPlayerStatRow {
  playerId: string;
  name: string;            // masked for public viewers, full for authed
  optedOut: boolean;
  /** true when innings_pitched_outs > 0 — lets the pitching table include opted-out
   *  pitchers (shown as `—`) without exposing the count. */
  pitched: boolean;
  plateAppearances: number | null;   // null when optedOut
  inningsPitchedOuts: number | null;  // null when optedOut
  stats: unknown;                     // null when optedOut
}
```

```ts
export function toTeamPlayerRows(snap: any[], isAuthed: boolean): TeamPlayerStatRow[] {
  return snap.map((r) => {
    const optedOut = !isAuthed && !!r.public_opt_out;
    return {
      playerId: r.player_id,
      name: isAuthed
        ? memberDisplayName({ firstName: r.first_name, lastName: r.last_name })
        : publicDisplayName({ firstName: r.first_name, lastName: r.last_name }),
      optedOut,
      pitched: (r.innings_pitched_outs ?? 0) > 0,
      plateAppearances: optedOut ? null : (r.plate_appearances ?? 0),
      inningsPitchedOuts: optedOut ? null : (r.innings_pitched_outs ?? 0),
      stats: optedOut ? null : r.stats,
    };
  });
}
```

Authed viewers (`optedOut` always false) keep full data — they are allowed to see it.

The loader's manual `players.sort(...)` in `getTeamStatPageData` is **removed**: the
client table owns ordering and sorts during render, so the server-rendered (SSR) output
already reflects the default sort. (One consequence: `plateAppearances` is now nullable,
which would have made the old subtraction sort `NaN` anyway.)

### Pure sort module (`lib/league-home/team-table-sort.ts`, client-safe)

```ts
import { getStatValue } from './stat-value';
import type { StatFormat } from './format-stat';
import type { TeamPlayerStatRow } from './team-load';

export interface SortColumnSpec {
  key: string;                 // 'name' | 'pa' | 'ip' | <stat key>
  label: string;
  source: 'name' | 'pa' | 'ip' | 'stat';
  field: string;               // dot-path into stats (source === 'stat'); '' otherwise
  format: StatFormat;          // display formatter
  sortDir: 'asc' | 'desc';     // natural best-first direction
}

/** Numeric sort value for a row in a column. Opted-out rows yield 0 but are never
 *  ordered by it — they are pinned to the bottom by sortPlayerRows. */
export function cellValue(p: TeamPlayerStatRow, col: SortColumnSpec): number {
  if (col.source === 'pa') return p.plateAppearances ?? 0;
  if (col.source === 'ip') return p.inningsPitchedOuts ?? 0;
  return getStatValue(p.stats, col.field);
}

/** Sort rows for the active column + direction.
 *  - name column: alphabetical over ALL rows (names are visible to everyone).
 *  - numeric column: non-opted-out rows sorted by value; opted-out rows pinned to the
 *    bottom (sorted by name), so a hidden value never affects position.
 *  Ties break by name for determinism. */
export function sortPlayerRows(
  rows: TeamPlayerStatRow[],
  col: SortColumnSpec,
  dir: 'asc' | 'desc',
): TeamPlayerStatRow[] {
  const mul = dir === 'asc' ? 1 : -1;
  if (col.source === 'name') {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name) * mul);
  }
  const visible = rows.filter((r) => !r.optedOut);
  const hidden = rows.filter((r) => r.optedOut).sort((a, b) => a.name.localeCompare(b.name));
  visible.sort((a, b) => {
    const d = (cellValue(a, col) - cellValue(b, col)) * mul;
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return [...visible, ...hidden];
}
```

### Client table (`SortablePlayerTable.tsx`, `'use client'`)

Props (all serializable — no functions cross the boundary):

```ts
{
  nameHeader: string;            // 'Player' | 'Pitcher'
  rows: TeamPlayerStatRow[];     // already sanitized server-side
  columns: SortColumnSpec[];     // [PA|IP, ...stat columns]
  defaultSortKey: string;        // 'pa' | 'ip'
}
```

- `useState<{ key: string; dir: 'asc' | 'desc' }>` initialized to the default column at
  its natural `sortDir`.
- Header click: same key → flip `dir`; different key → set key + that column's natural
  `sortDir` (name column natural dir = `'asc'`).
- Sorted rows derived in render via `sortPlayerRows` (so SSR and first client render match).
- Each `<th>` carries `aria-sort` and an arrow indicator on the active column; headers are
  `<button>` elements for keyboard accessibility.
- Cell display: `p.optedOut ? '—'` else `formatStat`. For `source: 'ip'`,
  `formatStat(p.inningsPitchedOuts ?? 0, 'ip')`; for `'pa'`, `formatStat(p.plateAppearances ?? 0, 'int')`;
  for `'stat'`, `formatStat(getStatValue(p.stats, col.field), col.format)`.

### Server wrappers (`TeamBattingTable.tsx` / `TeamPitchingTable.tsx`)

Thin server components that build the column specs and render `<SortablePlayerTable>`:

- **Batting:** `nameHeader='Player'`, columns `[{key:'pa',label:'PA',source:'pa',format:'int',sortDir:'desc'}, ...TEAM_BATTING_KEYS.map(toSpec)]`, `defaultSortKey='pa'`. Empty-state message when no players.
- **Pitching:** filter `players.filter((p) => p.pitched)`; return `null` if none.
  `nameHeader='Pitcher'`, columns `[{key:'ip',label:'IP',source:'ip',format:'ip',sortDir:'desc'}, ...TEAM_PITCHING_KEYS.map(toSpec)]`, `defaultSortKey='ip'`.

`toSpec(statKey)` uses `getStatDef` → `{ key, label, source:'stat', field, format, sortDir }`.

### Client-safe `getStatValue` extraction

`getStatValue` currently lives in `load.ts`, which also constructs the service-role
Supabase client. The client sort module + table import it, so move it to a dependency-free
module and re-export for existing callers (mirrors the `teamHref` → `team-href.ts` split):

- **New** `lib/league-home/stat-value.ts` — `export function getStatValue(stats, field)`.
- `load.ts` — `export { getStatValue } from './stat-value';` (drop the local definition; its
  internal `toLeaderRows`/`board` callers import from `./stat-value`).
- `team-load.ts` — import `getStatValue` from `./stat-value` (used by `buildTeamStatList`).

## File Structure

| File | Change |
|------|--------|
| `lib/league-home/stat-value.ts` | **new** — `getStatValue` (moved), client-safe |
| `lib/league-home/team-table-sort.ts` | **new** — `sortPlayerRows`, `cellValue`, `SortColumnSpec` |
| `app/l/[slug]/team/[teamId]/_components/SortablePlayerTable.tsx` | **new** — `'use client'` table |
| `lib/league-home/__tests__/team-table-sort.test.ts` | **new** — sort unit tests |
| `lib/league-home/load.ts` | re-export `getStatValue`; internal imports from `./stat-value` |
| `lib/league-home/team-load.ts` | `toTeamPlayerRows` blanking + `pitched`; type change; drop loader sort; import `getStatValue` from `./stat-value` |
| `_components/TeamBattingTable.tsx` | thin server wrapper building specs |
| `_components/TeamPitchingTable.tsx` | thin server wrapper building specs + `pitched` filter |

## Testing

- **`sortPlayerRows`**: numeric asc/desc ordering; opted-out rows pinned to the bottom
  regardless of their (hidden) value; name sort includes opted-out rows; tie-break by name
  is deterministic; `asc` vs `desc` direction honored for a "lower-is-better" stat.
- **`toTeamPlayerRows`** (extend existing): opted-out public rows have `stats`/`plateAppearances`/`inningsPitchedOuts`
  null and `pitched` reflecting the source; authed rows keep full data and `optedOut=false`.
- Client component is not unit-tested (consistent with existing presentational components);
  its logic lives in the tested pure module.

## Edge Cases

- **Opted-out pitcher**: appears in the pitching table (via `pitched`) with a masked name
  and `—` for IP and every stat; pinned to the bottom on any numeric sort.
- **All-opted-out public roster**: tables render all rows as `—`; numeric sorts are no-ops
  on order (everything pinned), name sort still works.
- **Hydration**: rows are sorted in render from the initial state, identical on server and
  client → no mismatch.
- **Ties**: resolved by name ascending, so order is stable across renders.

## Out of Scope / Future

- URL-encoded shareable sort state.
- Sticky header row / virtualization for very large rosters.
- Per-viewer remembered sort preference.
