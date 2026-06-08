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
  const defaultCol = columns.find((c) => c.key === defaultSortKey) ?? columns[0];
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: defaultCol?.key ?? 'name',
    dir: defaultCol?.sortDir ?? 'asc',
  });

  if (columns.length === 0) {
    return <p className="text-sm text-app-fg-subtle">No stats to display.</p>;
  }

  // Synthetic leading column for the player/pitcher name. `field`/`format` are
  // inert for source:'name' (cellValue/cellDisplay branch on source first). Assumes
  // no STAT_CATALOG key equals 'name' (none does) so header keys stay unique.
  const nameCol: SortColumnSpec = { key: 'name', label: nameHeader, source: 'name', field: '', format: 'int', sortDir: 'asc' };
  const allCols = [nameCol, ...columns];

  const activeCol = allCols.find((c) => c.key === sort.key) ?? nameCol;
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
                    className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-app-fg rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-fg/40 ${
                      active ? 'text-app-fg' : ''
                    } ${c.source === 'name' ? '' : 'mx-auto'}`}
                  >
                    {c.label}
                    <span aria-hidden className="inline-block w-2 text-[9px] leading-none">
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
