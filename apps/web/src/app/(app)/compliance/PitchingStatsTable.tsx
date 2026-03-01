'use client';

import { useState } from 'react';
import type { PitchingStats } from '@baseball/shared';
import { formatInningsPitched, formatAverage } from '@baseball/shared';

type ComplianceInfo = {
  pitchCount: number;
  requiredRestDays: number | null;
  canPitchNextDay: boolean | null;
  lastGameDate: string | null;
};

type Props = {
  stats: PitchingStats[];
  complianceMap: Record<string, ComplianceInfo>;
  today: string;
};

type SortKey =
  | 'playerName'
  | 'inningsPitchedOuts'
  | 'totalPitches'
  | 'strikePercentage'
  | 'firstPitchStrikePercentage'
  | 'threeBallCountPercentage'
  | 'era'
  | 'whip'
  | 'strikeoutsPerSeven'
  | 'walksPerSeven'
  | 'hitsAllowed'
  | 'walksAllowed'
  | 'strikeouts'
  | 'hitBatters'
  | 'wildPitches';

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: 'playerName',               label: 'Pitcher',  title: 'Pitcher name' },
  { key: 'inningsPitchedOuts',       label: 'IP',       title: 'Innings pitched' },
  { key: 'totalPitches',             label: 'PC',       title: 'Pitch count' },
  { key: 'strikePercentage',         label: 'STR%',     title: 'Strike percentage' },
  { key: 'firstPitchStrikePercentage', label: 'FPS%',  title: 'First-pitch strike percentage' },
  { key: 'threeBallCountPercentage', label: '3B%',      title: '% of PAs with a 3-ball count' },
  { key: 'era',                      label: 'ERA',      title: 'Earned run average (per 7 innings)' },
  { key: 'whip',                     label: 'WHIP',     title: 'Walks + hits per inning pitched' },
  { key: 'strikeoutsPerSeven',       label: 'K/7',      title: 'Strikeouts per 7 innings' },
  { key: 'walksPerSeven',            label: 'BB/7',     title: 'Walks per 7 innings' },
  { key: 'hitsAllowed',              label: 'H',        title: 'Hits allowed' },
  { key: 'walksAllowed',             label: 'BB',       title: 'Walks' },
  { key: 'strikeouts',               label: 'K',        title: 'Strikeouts' },
  { key: 'hitBatters',               label: 'HBP',      title: 'Hit batters' },
  { key: 'wildPitches',              label: 'WP',       title: 'Wild pitches' },
];

// Ball-strike count grid rows/cols
const COUNT_ROWS = [0, 1, 2, 3]; // balls
const COUNT_COLS = [0, 1, 2];    // strikes

function pct(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '---';
  return `${(value * 100).toFixed(1)}%`;
}

function stat(value: number, decimals = 2): string {
  if (!isFinite(value) || isNaN(value)) return '---';
  return value.toFixed(decimals);
}

function getValue(s: PitchingStats, key: SortKey): number | string {
  if (key === 'playerName') return s.playerName;
  return s[key];
}

export function PitchingStatsTable({ stats, complianceMap, today }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('inningsPitchedOuts');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'playerName');
    }
  }

  const sorted = [...stats].sort((a, b) => {
    const av = getValue(a, sortKey);
    const bv = getValue(b, sortKey);
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = av as number;
    const bn = bv as number;
    // Treat Infinity as very large (ERA/WHIP for 0 IP pitchers go last)
    const af = isFinite(an) ? an : 1e10;
    const bf = isFinite(bn) ? bn : 1e10;
    return sortAsc ? af - bf : bf - af;
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                title={col.title}
                onClick={() => handleSort(col.key)}
                className={`px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-gray-900 transition-colors ${
                  sortKey === col.key ? 'text-brand-700' : ''
                }`}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
              Rest
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {sorted.map((s) => {
            const compliance = complianceMap[s.playerId];
            const isExpanded = expandedId === s.playerId;

            return (
              <>
                <tr
                  key={s.playerId}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : s.playerId)}
                >
                  {/* Pitcher name — links to player profile */}
                  <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">
                    <span
                      className="text-brand-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.playerName}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">
                    {formatInningsPitched(s.inningsPitchedOuts)}
                  </td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{s.totalPitches}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{pct(s.strikePercentage)}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{pct(s.firstPitchStrikePercentage)}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{pct(s.threeBallCountPercentage)}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{stat(s.era)}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{stat(s.whip)}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{stat(s.strikeoutsPerSeven)}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{stat(s.walksPerSeven)}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{s.hitsAllowed}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{s.walksAllowed}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{s.strikeouts}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{s.hitBatters}</td>
                  <td className="px-3 py-3 text-gray-700 tabular-nums">{s.wildPitches}</td>
                  {/* Compliance / rest days */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <ComplianceBadge compliance={compliance} today={today} />
                  </td>
                </tr>

                {isExpanded && (
                  <tr key={`${s.playerId}-expand`}>
                    <td colSpan={COLUMNS.length + 1} className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                      <BaByCountGrid stats={s} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComplianceBadge({
  compliance,
  today,
}: {
  compliance: ComplianceInfo | undefined;
  today: string;
}) {
  if (!compliance) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const { requiredRestDays, canPitchNextDay, lastGameDate } = compliance;

  if (requiredRestDays == null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        Eligible
      </span>
    );
  }

  if (requiredRestDays === 0 || canPitchNextDay) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        Eligible
      </span>
    );
  }

  // Calculate days elapsed since last game
  let daysElapsed = 0;
  if (lastGameDate) {
    const last = new Date(lastGameDate);
    const now = new Date(today);
    daysElapsed = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
  }

  const daysRemaining = Math.max(0, requiredRestDays - daysElapsed);

  if (daysRemaining === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        Eligible
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
      {daysRemaining}d rest
    </span>
  );
}

function BaByCountGrid({ stats }: { stats: PitchingStats }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Batting Average Against by Count
      </p>
      <div className="inline-block">
        {/* Header row */}
        <div className="flex">
          <div className="w-16" />
          {COUNT_COLS.map((s) => (
            <div key={s} className="w-16 text-center text-xs font-semibold text-gray-500 pb-1">
              {s} str
            </div>
          ))}
        </div>
        {/* Data rows */}
        {COUNT_ROWS.map((b) => (
          <div key={b} className="flex items-center">
            <div className="w-16 text-xs font-semibold text-gray-500 pr-2 text-right">
              {b} {b === 1 ? 'ball' : 'balls'}
            </div>
            {COUNT_COLS.map((s) => {
              const key = `${b}-${s}`;
              const cs = stats.baByCount[key];
              const avg = cs ? formatAverage(cs.average) : '---';
              const hasData = cs && cs.atBats > 0;
              return (
                <div
                  key={s}
                  className={`w-16 h-10 flex flex-col items-center justify-center rounded text-xs border ${
                    hasData
                      ? 'bg-white border-gray-200 text-gray-900 font-mono'
                      : 'bg-gray-100 border-gray-100 text-gray-400'
                  }`}
                  title={hasData ? `${cs!.hits}-for-${cs!.atBats}` : 'No data'}
                >
                  <span className="font-semibold">{avg}</span>
                  {hasData && (
                    <span className="text-gray-400 text-[10px]">
                      {cs!.hits}/{cs!.atBats}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Summary stats */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
        <span>
          <span className="font-semibold text-gray-800">FPS%:</span>{' '}
          {pct(stats.firstPitchStrikePercentage)}
        </span>
        <span>
          <span className="font-semibold text-gray-800">3-Ball Count%:</span>{' '}
          {pct(stats.threeBallCountPercentage)}
        </span>
        <span>
          <span className="font-semibold text-gray-800">Total PAs:</span>{' '}
          {stats.totalPAs}
        </span>
        <span>
          <span className="font-semibold text-gray-800">Pitches:</span>{' '}
          {stats.strikes}S / {stats.balls}B / {stats.totalPitches} total
        </span>
      </div>
    </div>
  );
}
