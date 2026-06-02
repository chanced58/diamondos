'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';

export type GameResult = 'W' | 'L' | 'T';

export interface StandingsTeamRow {
  key: string;
  name: string;
  organization?: string | null;
  /** platform team id (null for opponent-only teams) — drives the "You" match and team link */
  teamId: string | null;
  isActive: boolean;
  isOpponent: boolean;
  wins: number;
  losses: number;
  ties: number;
  pct: number;
  rf: number;
  ra: number;
  diff: number;
  gamesPlayed: number;
  last5: GameResult[];
  streak: { type: GameResult; count: number } | null;
}

export interface StandingsDivision {
  id: string;
  name: string;
  teams: StandingsTeamRow[];
}

type SortKey = 'wins' | 'losses' | 'pct' | 'rf' | 'ra' | 'diff';
type SortDir = 'asc' | 'desc';

// Default direction when a column is first selected (RA: fewer is better → asc).
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  wins: 'desc',
  losses: 'asc',
  pct: 'desc',
  rf: 'desc',
  ra: 'asc',
  diff: 'desc',
};

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'L' },
  { key: 'pct', label: 'PCT' },
  { key: 'rf', label: 'RF' },
  { key: 'ra', label: 'RA' },
  { key: 'diff', label: 'DIFF' },
];

const RESULT_CHIP: Record<GameResult, string> = {
  W: 'bg-turf-500 text-white',
  L: 'bg-red-500 text-white',
  T: 'bg-gray-300 text-gray-700',
};

export function StandingsBoard({ divisions }: { divisions: StandingsDivision[] }): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('pct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const onSort = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  };

  const sortTeams = (teams: StandingsTeamRow[]): StandingsTeamRow[] =>
    [...teams].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      const ordered = sortDir === 'asc' ? diff : -diff;
      // Stable tiebreak on win% so equal primary keys stay sensible.
      return ordered !== 0 ? ordered : b.pct - a.pct;
    });

  return (
    <div className="space-y-6">
      {divisions.map((div) => {
        const sorted = sortTeams(div.teams);
        const maxWins = Math.max(1, ...div.teams.map((t) => t.wins));
        return (
          <div key={div.id} className="overflow-hidden rounded-xl border border-app-border bg-app-surface">
            <div className="border-b border-app-border px-6 py-4">
              <h2 className="font-semibold text-app-fg">{div.name}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
                    <th className="px-4 py-3 text-center">#</th>
                    <th className="px-4 py-3">Team</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => onSort(c.key)}
                          className="inline-flex items-center gap-0.5 font-medium uppercase tracking-wider hover:text-app-fg"
                        >
                          {c.label}
                          <span className="w-2 text-[10px]">
                            {sortKey === c.key ? (sortDir === 'asc' ? '▴' : '▾') : ''}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center">Last 5</th>
                    <th className="w-6 px-2 py-3" aria-label="Expand" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t, i) => (
                    <StandingsRow key={t.key} row={t} rank={i + 1} maxWins={maxWins} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StandingsRow({
  row,
  rank,
  maxWins,
}: {
  row: StandingsTeamRow;
  rank: number;
  maxWins: number;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const runsPerGame = row.gamesPlayed > 0 ? (row.rf / row.gamesPlayed).toFixed(1) : '—';

  return (
    <Fragment>
      <tr
        onClick={() => setOpen((v) => !v)}
        className={`cursor-pointer border-b border-app-border transition-colors hover:bg-app-surface-2 ${
          row.isActive ? 'bg-turf-50' : ''
        }`}
      >
        <td className="mono px-4 py-3 text-center text-app-fg-subtle">{rank}</td>
        <td className="relative px-4 py-3 font-medium text-app-fg">
          <span
            aria-hidden
            className="absolute inset-y-1.5 left-0 rounded-r bg-turf-100"
            style={{ width: `${Math.round((row.wins / maxWins) * 100)}%`, opacity: 0.5 }}
          />
          <span className="relative z-10 inline-flex items-center gap-2">
            {row.name}
            {row.organization ? <span className="text-xs text-app-fg-subtle">{row.organization}</span> : null}
            {row.isActive ? (
              <span className="rounded bg-turf-600 px-1.5 py-0.5 text-xs font-semibold text-white">You</span>
            ) : null}
            {row.isOpponent ? (
              <span className="rounded bg-clay-50 px-1.5 py-0.5 text-xs font-medium text-clay-700">Opponent</span>
            ) : null}
          </span>
        </td>
        <td className="mono px-3 py-3 text-center">{row.wins}</td>
        <td className="mono px-3 py-3 text-center">{row.losses}</td>
        <td className="mono px-3 py-3 text-center font-semibold">{row.pct.toFixed(3).replace(/^0/, '')}</td>
        <td className="mono px-3 py-3 text-center">{row.rf}</td>
        <td className="mono px-3 py-3 text-center">{row.ra}</td>
        <td className={`mono px-3 py-3 text-center font-semibold ${row.diff >= 0 ? 'text-turf-700' : 'text-red-600'}`}>
          {row.diff > 0 ? `+${row.diff}` : row.diff}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-center gap-2">
            <div className="flex gap-0.5">
              {row.last5.length === 0 ? (
                <span className="text-xs text-app-fg-subtle">—</span>
              ) : (
                row.last5.map((r, idx) => (
                  <span
                    key={idx}
                    className={`grid h-4 w-4 place-items-center rounded text-[9px] font-bold ${RESULT_CHIP[r]}`}
                    title={r}
                  >
                    {r}
                  </span>
                ))
              )}
            </div>
            {row.streak ? (
              <span
                className={`mono rounded px-1 text-[11px] font-bold ${
                  row.streak.type === 'W'
                    ? 'text-turf-700'
                    : row.streak.type === 'L'
                      ? 'text-red-600'
                      : 'text-app-fg-muted'
                }`}
              >
                {row.streak.type}
                {row.streak.count}
              </span>
            ) : null}
          </div>
        </td>
        <td className="px-2 py-3 text-center text-app-fg-subtle">
          <svg
            viewBox="0 0 16 16"
            className={`inline h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </td>
      </tr>
      {open ? (
        <tr className={row.isActive ? 'bg-turf-50' : 'bg-app-surface-2'}>
          <td colSpan={10} className="px-6 py-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <Metric label="Win %" value={row.pct.toFixed(3).replace(/^0/, '')} />
              <Metric label="Runs / Game" value={runsPerGame} />
              <Metric label="Run Diff" value={row.diff > 0 ? `+${row.diff}` : String(row.diff)} />
              <Metric label="Current Streak" value={row.streak ? `${row.streak.type}${row.streak.count}` : '—'} />
              {row.teamId ? (
                <Link
                  href={`/teams/${row.teamId}`}
                  className="ml-auto text-sm font-medium text-brand-700 hover:underline"
                >
                  Team page →
                </Link>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-app-fg-muted">{label}</div>
      <div className="mono mt-0.5 text-lg font-bold text-app-fg">{value}</div>
    </div>
  );
}
