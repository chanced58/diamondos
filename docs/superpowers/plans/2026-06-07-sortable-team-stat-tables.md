# Sortable Team Stat Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the team stat page's batting and pitching tables sortable by clicking any column header, with instant client-side sorting that preserves the opt-out privacy guarantee.

**Architecture:** A shared `'use client'` `SortablePlayerTable` component holds the sort state (`useState`) and renders both tables; thin server wrappers (`TeamBattingTable`/`TeamPitchingTable`) build serializable column specs and pass sanitized rows. Opted-out players' stat values are stripped server-side in `toTeamPlayerRows` (replaced with `null` + a `pitched` flag) so the hidden numbers never reach the browser. Sorting logic lives in a pure, unit-tested module; `getStatValue` is extracted to a client-safe module so the client component can use it without pulling in server-only code.

**Tech Stack:** Next.js 14 (App Router; server + client components), React `useState`, TypeScript, Tailwind, `@baseball/shared` (`getStatDef`), Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-06-07-sortable-team-stat-tables-design.md`

---

## File Structure

| File | Change |
|------|--------|
| `apps/web/src/lib/league-home/stat-value.ts` | **new** — `getStatValue` (moved), client-safe (no server-only deps) |
| `apps/web/src/lib/league-home/__tests__/stat-value.test.ts` | **new** — dot-path unit tests |
| `apps/web/src/lib/league-home/team-table-sort.ts` | **new** — `SortColumnSpec`, `cellValue`, `cellDisplay`, `sortPlayerRows` (client-safe, pure) |
| `apps/web/src/lib/league-home/__tests__/team-table-sort.test.ts` | **new** — sort/cell unit tests |
| `apps/web/src/app/l/[slug]/team/[teamId]/_components/SortablePlayerTable.tsx` | **new** — `'use client'` table |
| `apps/web/src/lib/league-home/load.ts` | re-export `getStatValue` from `./stat-value`; internal callers import from `./stat-value` |
| `apps/web/src/lib/league-home/team-load.ts` | `toTeamPlayerRows` sanitization + `pitched`; `TeamPlayerStatRow` type; drop loader player sort; import `getStatValue` from `./stat-value` |
| `apps/web/src/lib/league-home/__tests__/team-load.test.ts` | extend `toTeamPlayerRows` tests |
| `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamBattingTable.tsx` | thin server wrapper → `SortablePlayerTable` |
| `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamPitchingTable.tsx` | thin server wrapper → `SortablePlayerTable` |

**Test commands** (from repo root):
- Web tests: `pnpm --filter web test -- <name>`
- Type check: `pnpm --filter web type-check`
- Lint: `pnpm --filter web lint`

**Server-only boundary note:** `team-load.ts` has `import 'server-only'`. Client-safe modules (`team-table-sort.ts`) and the client component import `TeamPlayerStatRow` from it with **`import type`** only — a type-only import is erased at compile time and triggers no runtime `server-only` import, so it's safe. Every such import in this plan uses `import type`.

---

## Task 1: Extract `getStatValue` into a client-safe module

**Files:**
- Create: `apps/web/src/lib/league-home/stat-value.ts`
- Create: `apps/web/src/lib/league-home/__tests__/stat-value.test.ts`
- Modify: `apps/web/src/lib/league-home/load.ts`
- Modify: `apps/web/src/lib/league-home/team-load.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/league-home/__tests__/stat-value.test.ts`:

```ts
import { getStatValue } from '../stat-value';

describe('getStatValue', () => {
  it('reads a top-level numeric field', () => {
    expect(getStatValue({ avg: 0.351 }, 'avg')).toBe(0.351);
  });
  it('reads a dot-pathed nested field', () => {
    expect(getStatValue({ a: { b: 5 } }, 'a.b')).toBe(5);
  });
  it('returns 0 for a missing field or null stats', () => {
    expect(getStatValue({ avg: 0.3 }, 'obp')).toBe(0);
    expect(getStatValue(null, 'avg')).toBe(0);
    expect(getStatValue('not-an-object', 'avg')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- stat-value`
Expected: FAIL — "Cannot find module '../stat-value'".

- [ ] **Step 3: Create `stat-value.ts` (move the implementation verbatim)**

Create `apps/web/src/lib/league-home/stat-value.ts`:

```ts
/** Read a (possibly dot-pathed) stat field out of a snapshot `stats` object. */
export function getStatValue(stats: unknown, field: string): number {
  if (stats == null || typeof stats !== 'object') return 0;
  const raw = field.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, stats);
  return Number(raw ?? 0);
}
```

- [ ] **Step 4: Re-export from `load.ts` and repoint internal callers**

In `apps/web/src/lib/league-home/load.ts`:
- Delete the local `export function getStatValue(...) { ... }` definition (the whole block, including its `/** Read a ... */` doc comment).
- Add a re-export near the top of the file, after the existing imports:

```ts
export { getStatValue } from './stat-value';
```

- Add an import so the two internal callers (`toLeaderRows`, `board`) still resolve `getStatValue`. Put it with the other imports at the top:

```ts
import { getStatValue } from './stat-value';
```

(The two internal call sites — `value: getStatValue(r.stats, def.field)` in `toLeaderRows` and `value: getStatValue(t.stats, def.field)` in `board` — are unchanged; they now resolve via the import.)

- [ ] **Step 5: Repoint `team-load.ts`**

In `apps/web/src/lib/league-home/team-load.ts`, change the `getStatValue` import. It currently imports from `./load`:

```ts
import { getStatValue, resolveVisibility } from './load';
```

Change to import `getStatValue` from `./stat-value` and keep `resolveVisibility` from `./load`:

```ts
import { resolveVisibility } from './load';
import { getStatValue } from './stat-value';
```

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm --filter web test -- "stat-value|league-home"`
Expected: PASS (new stat-value tests + all existing league-home/team-load tests).
Run: `pnpm --filter web type-check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/league-home/stat-value.ts apps/web/src/lib/league-home/__tests__/stat-value.test.ts apps/web/src/lib/league-home/load.ts apps/web/src/lib/league-home/team-load.ts
git commit -m "refactor(web): extract getStatValue into a client-safe module"
```

---

## Task 2: Pure sort module (`team-table-sort.ts`)

**Files:**
- Create: `apps/web/src/lib/league-home/team-table-sort.ts`
- Create: `apps/web/src/lib/league-home/__tests__/team-table-sort.test.ts`

This task assumes the **current** `TeamPlayerStatRow` shape (non-null PA/IP). The `?? 0` guards in the helpers make them forward-compatible with the nullable shape introduced in Task 4, so nothing here changes when that lands.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/league-home/__tests__/team-table-sort.test.ts`:

```ts
import { cellValue, cellDisplay, sortPlayerRows, type SortColumnSpec } from '../team-table-sort';
import type { TeamPlayerStatRow } from '../team-load';

const avgCol: SortColumnSpec = { key: 'avg', label: 'AVG', source: 'stat', field: 'avg', format: 'avg3', sortDir: 'desc' };
const eraCol: SortColumnSpec = { key: 'era', label: 'ERA', source: 'stat', field: 'era', format: 'ratio2', sortDir: 'asc' };
const nameCol: SortColumnSpec = { key: 'name', label: 'Player', source: 'name', field: '', format: 'int', sortDir: 'asc' };

function row(p: Partial<TeamPlayerStatRow> & { playerId: string; name: string }): TeamPlayerStatRow {
  return {
    optedOut: false, pitched: false, plateAppearances: 0, inningsPitchedOuts: 0, stats: {},
    ...p,
  } as TeamPlayerStatRow;
}

describe('cellValue', () => {
  it('reads PA, IP, and stat-field values', () => {
    expect(cellValue(row({ playerId: 'a', name: 'A', plateAppearances: 12 }), { ...avgCol, source: 'pa' })).toBe(12);
    expect(cellValue(row({ playerId: 'a', name: 'A', inningsPitchedOuts: 9 }), { ...avgCol, source: 'ip' })).toBe(9);
    expect(cellValue(row({ playerId: 'a', name: 'A', stats: { avg: 0.4 } }), avgCol)).toBe(0.4);
  });
});

describe('cellDisplay', () => {
  it('blanks every cell for opted-out rows', () => {
    const p = row({ playerId: 'x', name: 'X', optedOut: true, plateAppearances: null, inningsPitchedOuts: null, stats: null });
    expect(cellDisplay(p, avgCol)).toBe('—');
    expect(cellDisplay(p, { ...avgCol, source: 'pa' })).toBe('—');
  });
  it('formats visible values per the column format', () => {
    const p = row({ playerId: 'y', name: 'Y', stats: { avg: 0.351 } });
    expect(cellDisplay(p, avgCol)).toBe('.351');
  });
});

describe('sortPlayerRows', () => {
  const rows = [
    row({ playerId: 'a', name: 'Alice', stats: { avg: 0.2 } }),
    row({ playerId: 'b', name: 'Bob', stats: { avg: 0.4 } }),
    row({ playerId: 'c', name: 'Cara', stats: { avg: 0.3 } }),
  ];

  it('sorts by a stat descending (best-first)', () => {
    expect(sortPlayerRows(rows, avgCol, 'desc').map((r) => r.playerId)).toEqual(['b', 'c', 'a']);
  });
  it('sorts ascending when direction is asc (e.g. ERA lower-is-better)', () => {
    const era = [
      row({ playerId: 'a', name: 'Alice', stats: { era: 3.0 } }),
      row({ playerId: 'b', name: 'Bob', stats: { era: 1.0 } }),
    ];
    expect(sortPlayerRows(era, eraCol, 'asc').map((r) => r.playerId)).toEqual(['b', 'a']);
  });
  it('pins opted-out rows to the bottom regardless of their hidden value', () => {
    const mixed = [
      row({ playerId: 'a', name: 'Alice', stats: { avg: 0.2 } }),
      row({ playerId: 'z', name: 'Zoe', optedOut: true, stats: { avg: 0.9 } }), // hidden .900 must NOT float to top
      row({ playerId: 'b', name: 'Bob', stats: { avg: 0.4 } }),
    ];
    expect(sortPlayerRows(mixed, avgCol, 'desc').map((r) => r.playerId)).toEqual(['b', 'a', 'z']);
  });
  it('sorts the name column over all rows including opted-out', () => {
    const mixed = [
      row({ playerId: 'c', name: 'Cara' }),
      row({ playerId: 'z', name: 'Zoe', optedOut: true }),
      row({ playerId: 'a', name: 'Alice' }),
    ];
    expect(sortPlayerRows(mixed, nameCol, 'asc').map((r) => r.playerId)).toEqual(['a', 'c', 'z']);
  });
  it('breaks numeric ties by name for determinism', () => {
    const tied = [
      row({ playerId: 'b', name: 'Bob', stats: { avg: 0.3 } }),
      row({ playerId: 'a', name: 'Alice', stats: { avg: 0.3 } }),
    ];
    expect(sortPlayerRows(tied, avgCol, 'desc').map((r) => r.playerId)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- team-table-sort`
Expected: FAIL — "Cannot find module '../team-table-sort'".

- [ ] **Step 3: Implement `team-table-sort.ts`**

Create `apps/web/src/lib/league-home/team-table-sort.ts`:

```ts
import { getStatValue } from './stat-value';
import { formatStat, type StatFormat } from './format-stat';
import type { TeamPlayerStatRow } from './team-load';

export interface SortColumnSpec {
  key: string; // 'name' | 'pa' | 'ip' | <stat key>
  label: string;
  source: 'name' | 'pa' | 'ip' | 'stat';
  field: string; // dot-path into stats (source === 'stat'); '' otherwise
  format: StatFormat;
  sortDir: 'asc' | 'desc'; // natural best-first direction
}

/** Numeric sort value for a row in a column. Opted-out rows yield 0 but are never
 *  ordered by it — sortPlayerRows pins them to the bottom. */
export function cellValue(p: TeamPlayerStatRow, col: SortColumnSpec): number {
  if (col.source === 'pa') return p.plateAppearances ?? 0;
  if (col.source === 'ip') return p.inningsPitchedOuts ?? 0;
  return getStatValue(p.stats, col.field);
}

/** Display string for a cell. Opted-out rows render '—' for every numeric column. */
export function cellDisplay(p: TeamPlayerStatRow, col: SortColumnSpec): string {
  if (p.optedOut) return '—';
  if (col.source === 'pa') return formatStat(p.plateAppearances ?? 0, 'int');
  if (col.source === 'ip') return formatStat(p.inningsPitchedOuts ?? 0, 'ip');
  return formatStat(getStatValue(p.stats, col.field), col.format);
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- team-table-sort`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Type-check**

Run: `pnpm --filter web type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/league-home/team-table-sort.ts apps/web/src/lib/league-home/__tests__/team-table-sort.test.ts
git commit -m "feat(web): add pure sort module for team stat tables"
```

---

## Task 3: `SortablePlayerTable` client component

**Files:**
- Create: `apps/web/src/app/l/[slug]/team/[teamId]/_components/SortablePlayerTable.tsx`

This component compiles against the current `TeamPlayerStatRow` (the `?? 0` guards in the sort helpers handle both the current and the nullable shape). It is not wired into the page until Task 4.

- [ ] **Step 1: Create the component**

Create `apps/web/src/app/l/[slug]/team/[teamId]/_components/SortablePlayerTable.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { sortPlayerRows, cellDisplay, type SortColumnSpec } from '@/lib/league-home/team-table-sort';
import type { TeamPlayerStatRow } from '@/lib/league-home/team-load';

export function SortablePlayerTable({
  nameHeader,
  rows,
  columns,
  defaultSortKey,
}: {
  nameHeader: string;
  rows: TeamPlayerStatRow[];
  columns: SortColumnSpec[];
  defaultSortKey: string;
}): JSX.Element {
  const nameCol: SortColumnSpec = { key: 'name', label: nameHeader, source: 'name', field: '', format: 'int', sortDir: 'asc' };
  const allCols = [nameCol, ...columns];
  const defaultCol = columns.find((c) => c.key === defaultSortKey) ?? columns[0];
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: defaultCol.key,
    dir: defaultCol.sortDir,
  });

  const activeCol = allCols.find((c) => c.key === sort.key) ?? defaultCol;
  const sorted = sortPlayerRows(rows, activeCol, sort.dir);

  const onSort = (col: SortColumnSpec): void => {
    setSort((prev) =>
      prev.key === col.key
        ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: col.sortDir },
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-app-border bg-app-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
            {allCols.map((c) => {
              const active = c.key === sort.key;
              return (
                <th
                  key={c.key}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={c.source === 'name' ? 'px-3 py-2.5' : 'px-2 py-2.5 text-center'}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-app-fg ${
                      active ? 'text-app-fg' : ''
                    } ${c.source === 'name' ? '' : 'mx-auto'}`}
                  >
                    {c.label}
                    <span aria-hidden className="text-[9px] leading-none">
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {sorted.map((p) => (
            <tr key={p.playerId}>
              <td className="px-3 py-2.5 font-medium text-app-fg">{p.name}</td>
              {columns.map((c) => (
                <td key={c.key} className="mono px-2 py-2.5 text-center">
                  {cellDisplay(p, c)}
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

- [ ] **Step 2: Type-check**

Run: `pnpm --filter web type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/l/[slug]/team/[teamId]/_components/SortablePlayerTable.tsx"
git commit -m "feat(web): add SortablePlayerTable client component"
```

---

## Task 4: Sanitize rows + wire the wrappers (integration)

**Files:**
- Modify: `apps/web/src/lib/league-home/team-load.ts`
- Modify: `apps/web/src/lib/league-home/__tests__/team-load.test.ts`
- Modify: `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamBattingTable.tsx`
- Modify: `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamPitchingTable.tsx`

This task changes the `TeamPlayerStatRow` type and the two consumers together, so the build stays green. The type change (nullable PA/IP) makes the old `p.inningsPitchedOuts > 0` comparison a type error, which is why the wrappers are rewritten in the same task.

- [ ] **Step 1: Write the failing test (extend `toTeamPlayerRows` tests)**

In `apps/web/src/lib/league-home/__tests__/team-load.test.ts`, replace the `toTeamPlayerRows` snapshot fixture and add blanking/`pitched` assertions. Find the `describe('toTeamPlayerRows', ...)` block and replace its `snap` constant and add two new `it` blocks:

```ts
describe('toTeamPlayerRows', () => {
  const snap = [
    { player_id: 'p1', first_name: 'Alex', last_name: 'Ramirez', public_opt_out: false, stats: { avg: 0.35 }, plate_appearances: 30, innings_pitched_outs: 0 },
    { player_id: 'p2', first_name: 'Sam', last_name: 'Lee', public_opt_out: true, stats: { avg: 0.4 }, plate_appearances: 25, innings_pitched_outs: 0 },
    { player_id: 'p3', first_name: 'Pat', last_name: 'Kim', public_opt_out: true, stats: { era: 2.1 }, plate_appearances: 0, innings_pitched_outs: 18 },
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
  it('blanks all numeric data for opted-out public rows but keeps the pitched flag', () => {
    const rows = toTeamPlayerRows(snap as any, false);
    expect(rows.find((r) => r.playerId === 'p3')).toMatchObject({
      optedOut: true,
      pitched: true, // innings_pitched_outs > 0 — still listed in the pitching table
      plateAppearances: null,
      inningsPitchedOuts: null,
      stats: null,
    });
  });
  it('keeps full numeric data (and pitched) for authed viewers', () => {
    const rows = toTeamPlayerRows(snap as any, true);
    expect(rows.find((r) => r.playerId === 'p3')).toMatchObject({
      optedOut: false,
      pitched: true,
      inningsPitchedOuts: 18,
      stats: { era: 2.1 },
    });
    expect(rows.find((r) => r.playerId === 'p1')).toMatchObject({ pitched: false, plateAppearances: 30 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- team-load`
Expected: FAIL — the new `pitched`/`null` assertions fail (current code returns numbers and has no `pitched`).

- [ ] **Step 3: Update the `TeamPlayerStatRow` type**

In `apps/web/src/lib/league-home/team-load.ts`, replace the `TeamPlayerStatRow` interface:

```ts
/** A roster player's display row. Opted-out public rows carry no numeric data —
 *  it is stripped here so it never reaches the (client) table payload. */
export interface TeamPlayerStatRow {
  playerId: string;
  name: string;
  /** true only for public viewers of an opted-out player; cells render '—' */
  optedOut: boolean;
  /** true when innings_pitched_outs > 0 — lets the pitching table include opted-out
   *  pitchers (shown as '—') without exposing the count */
  pitched: boolean;
  plateAppearances: number | null;
  inningsPitchedOuts: number | null;
  stats: unknown;
}
```

- [ ] **Step 4: Sanitize `toTeamPlayerRows`**

Replace the `toTeamPlayerRows` function body:

```ts
/** Map player snapshot rows to display rows with name masking + opt-out blanking. */
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

- [ ] **Step 5: Drop the loader's player sort**

In `getTeamStatPageData`, remove the now-redundant player sort (the client table owns ordering). Delete these lines:

```ts
  // Sort batting by playing time (PA desc) and pitching by workload (IP desc) — never
  // by a hidden stat, so opted-out public rows don't leak an ordering signal.
  players.sort((a, b) => b.plateAppearances - a.plateAppearances);
```

(The `players` const is still returned in the `ok` payload, just unsorted — the table sorts on render.)

- [ ] **Step 6: Rewrite `TeamBattingTable.tsx`**

Replace the entire file `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamBattingTable.tsx`:

```tsx
import { getStatDef } from '@baseball/shared';
import { TEAM_BATTING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';
import type { SortColumnSpec } from '@/lib/league-home/team-table-sort';
import { SortablePlayerTable } from './SortablePlayerTable';

export function TeamBattingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element {
  if (players.length === 0) {
    return <p className="text-sm text-app-fg-subtle">No players yet for this season.</p>;
  }
  const columns: SortColumnSpec[] = [
    { key: 'pa', label: 'PA', source: 'pa', field: '', format: 'int', sortDir: 'desc' },
    ...TEAM_BATTING_KEYS.map((k) => {
      const d = getStatDef(k);
      return { key: d.key, label: d.label, source: 'stat' as const, field: d.field, format: d.format, sortDir: d.sortDir };
    }),
  ];
  return <SortablePlayerTable nameHeader="Player" rows={players} columns={columns} defaultSortKey="pa" />;
}
```

- [ ] **Step 7: Rewrite `TeamPitchingTable.tsx`**

Replace the entire file `apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamPitchingTable.tsx`:

```tsx
import { getStatDef } from '@baseball/shared';
import { TEAM_PITCHING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';
import type { SortColumnSpec } from '@/lib/league-home/team-table-sort';
import { SortablePlayerTable } from './SortablePlayerTable';

export function TeamPitchingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element | null {
  const pitchers = players.filter((p) => p.pitched);
  if (pitchers.length === 0) return null;
  const columns: SortColumnSpec[] = [
    { key: 'ip', label: 'IP', source: 'ip', field: '', format: 'ip', sortDir: 'desc' },
    ...TEAM_PITCHING_KEYS.map((k) => {
      const d = getStatDef(k);
      return { key: d.key, label: d.label, source: 'stat' as const, field: d.field, format: d.format, sortDir: d.sortDir };
    }),
  ];
  return <SortablePlayerTable nameHeader="Pitcher" rows={pitchers} columns={columns} defaultSortKey="ip" />;
}
```

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm --filter web test -- "team-load|team-table-sort"`
Expected: PASS (extended `toTeamPlayerRows` tests green; sort tests still green).
Run: `pnpm --filter web type-check`
Expected: no errors. (If the old `p.inningsPitchedOuts > 0` lingered anywhere it would error here — confirm both wrappers were fully replaced.)

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/league-home/team-load.ts apps/web/src/lib/league-home/__tests__/team-load.test.ts "apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamBattingTable.tsx" "apps/web/src/app/l/[slug]/team/[teamId]/_components/TeamPitchingTable.tsx"
git commit -m "feat(web): sortable team batting/pitching tables with opt-out-safe payload"
```

---

## Task 5: Full verification + docs

**Files:**
- Modify: `CLAUDE.md` (glossary — note the tables are client-sortable)

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm --filter web test`
Expected: all PASS.

- [ ] **Step 2: Type-check + lint**

Run: `pnpm --filter web type-check`
Expected: no errors.
Run: `pnpm --filter web lint`
Expected: exit 0 (no new errors in the touched files).

- [ ] **Step 3: Manual smoke (recommended)**

Run `pnpm --filter web dev`, open `/l/<slug>/team/<teamId>`. Click batting/pitching column headers: rows re-sort, arrow flips on second click, opted-out players (if any, viewed signed-out) stay at the bottom showing `—`. Confirm devtools "view source" / React props for an opted-out player contain no real stat numbers.

- [ ] **Step 4: Update the glossary**

In `CLAUDE.md`, find the `**TeamStatPage**` glossary row and append this sentence to its cell (before the closing `|`):

```text
The batting/pitching tables are client-sortable by any column (`SortablePlayerTable`); opted-out players' numeric values are stripped server-side in `toTeamPlayerRows` (not just hidden) so they never reach the client payload, and such rows pin to the bottom of any numeric sort.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note sortable team tables in glossary"
```

- [ ] **Step 6: Run coderabbit review** (per DiamondOS workflow in CLAUDE.md)

Push and let the configured CodeRabbit review run on the PR; address findings before merge.

---

## Self-Review Notes

- **Spec coverage:** client-side sortable columns (T2/T3/T4) ✓; best-first first click + toggle (T3 `onSort`) ✓; pin opted-out to bottom (T2 `sortPlayerRows`) ✓; payload sanitization + `pitched` (T4 `toTeamPlayerRows`) ✓; client-safe `getStatValue` extraction (T1) ✓; pure-module unit tests (T2) + `toTeamPlayerRows` tests (T4) ✓; drop loader sort (T4) ✓; glossary (T5) ✓.
- **Type consistency:** `SortColumnSpec` (`key/label/source/field/format/sortDir`) is defined once in `team-table-sort.ts` and built identically in both wrappers; `TeamPlayerStatRow` (with `pitched`, nullable PA/IP, `stats: unknown`) is defined once in `team-load.ts` and imported via `import type` everywhere client-safe.
- **Server-only safety:** the client component and `team-table-sort.ts` import `TeamPlayerStatRow` with `import type` only; runtime imports (`getStatValue`, `formatStat`) come from client-safe modules — no `server-only` module is imported at runtime by client code.
- **No placeholders:** every step contains full code or an exact command + expected result.
