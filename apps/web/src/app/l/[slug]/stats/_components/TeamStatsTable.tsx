'use client';

import { useState } from 'react';
import { STAT_CATALOG } from '@baseball/shared';
import { formatStat } from '@/lib/league-home/format-stat';
import { getStatValue } from '@/lib/league-home/stat-value';
import { teamHref } from '@/lib/league-home/team-href';
import type { StatsTeam } from '@/lib/league-stats/load';
import { teamRowId } from './YourRanksCard';

type SortDir = 'asc' | 'desc';

interface TeamColumn {
  key: string;
  label: string;
  sortDir: SortDir; // natural best-first direction
  value: (t: StatsTeam) => number;
  display: (t: StatsTeam) => string;
}

const STAT_COLUMNS: TeamColumn[] = [
  {
    key: 'pct',
    label: 'PCT',
    sortDir: 'desc',
    value: (t) => t.winPct,
    display: (t) => formatStat(t.winPct, 'avg3'),
  },
  ...STAT_CATALOG.filter((d) => d.subject === 'team').map((d) => ({
    key: d.key,
    label: d.label,
    sortDir: d.sortDir,
    value: (t: StatsTeam) => getStatValue(t.stats, d.field),
    display: (t: StatsTeam) => formatStat(getStatValue(t.stats, d.field), d.format),
  })),
];

export function TeamStatsTable({
  teams,
  showRank,
  slug,
  season,
  highlightTeamId,
}: {
  /** Already in standings order. */
  teams: StatsTeam[];
  /** The # column follows the league's standings toggle. */
  showRank: boolean;
  slug: string;
  season: string;
  highlightTeamId: string | null;
}): JSX.Element {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: 'pct', dir: 'desc' });

  const onSort = (key: string, natural: SortDir): void =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: natural }));

  const mul = sort.dir === 'asc' ? 1 : -1;
  const active = STAT_COLUMNS.find((c) => c.key === sort.key);
  // Array.prototype.sort is stable, so ties keep the standings order.
  const sorted = [...teams].sort((a, b) =>
    active ? (active.value(a) - active.value(b)) * mul : a.name.localeCompare(b.name) * mul,
  );

  const header = (key: string, label: string, natural: SortDir, align: 'left' | 'center'): JSX.Element => {
    const isActive = key === sort.key;
    return (
      <th
        key={key}
        aria-sort={isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={align === 'left' ? 'px-3 py-2.5' : 'px-2 py-2.5 text-center'}
      >
        <button
          type="button"
          onClick={() => onSort(key, natural)}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded uppercase tracking-wider hover:text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-fg/40 ${
            isActive ? 'text-app-fg' : ''
          } ${align === 'center' ? 'mx-auto' : ''}`}
        >
          {label}
          <span aria-hidden className="inline-block w-2 text-[9px] leading-none">
            {isActive ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-app-border bg-app-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
            {showRank ? <th className="px-3 py-2.5 text-center">#</th> : null}
            {header('name', 'Team', 'asc', 'left')}
            <th className="whitespace-nowrap px-2 py-2.5 text-center">W-L-T</th>
            {STAT_COLUMNS.map((c) => header(c.key, c.label, c.sortDir, 'center'))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {sorted.map((t) => {
            const highlighted = t.teamId === highlightTeamId;
            return (
              <tr key={t.teamId} id={teamRowId(t.teamId)} className={highlighted ? 'bg-turf-50' : ''}>
                {showRank ? (
                  <td className="mono px-3 py-2.5 text-center text-app-fg-subtle">{t.rank ?? '—'}</td>
                ) : null}
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-app-fg">
                  <a href={teamHref(slug, t.teamId, season)} className="hover:underline">
                    {t.name}
                  </a>
                  {highlighted ? (
                    <span
                      aria-label="Your team"
                      title="Your team"
                      className="ml-1 inline-block h-2 w-2 rotate-45 rounded-[1px] bg-turf-600 align-middle"
                    />
                  ) : null}
                </td>
                <td className="mono whitespace-nowrap px-2 py-2.5 text-center">
                  {t.wins}-{t.losses}-{t.ties}
                </td>
                {STAT_COLUMNS.map((c) => (
                  <td key={c.key} className={`mono px-2 py-2.5 text-center ${c.key === 'pct' ? 'font-semibold' : ''}`}>
                    {c.display(t)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
