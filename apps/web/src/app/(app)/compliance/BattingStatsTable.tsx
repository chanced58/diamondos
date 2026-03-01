'use client';

import { useState } from 'react';
import type { BattingStats } from '@baseball/shared';
import { formatBattingRate, formatBattingPct } from '@baseball/shared';

type SortKey = keyof Omit<BattingStats, 'playerId' | 'playerName'> | 'playerName';

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: 'playerName',      label: 'Batter',  title: 'Player name' },
  { key: 'gamesAppeared',   label: 'G',       title: 'Games appeared' },
  { key: 'plateAppearances', label: 'PA',     title: 'Plate appearances' },
  { key: 'atBats',          label: 'AB',      title: 'At-bats' },
  { key: 'runs',            label: 'R',       title: 'Runs scored' },
  { key: 'hits',            label: 'H',       title: 'Hits' },
  { key: 'doubles',         label: '2B',      title: 'Doubles' },
  { key: 'triples',         label: '3B',      title: 'Triples' },
  { key: 'homeRuns',        label: 'HR',      title: 'Home runs' },
  { key: 'rbi',             label: 'RBI',     title: 'Runs batted in' },
  { key: 'walks',           label: 'BB',      title: 'Walks' },
  { key: 'strikeouts',      label: 'K',       title: 'Strikeouts' },
  { key: 'hitByPitch',      label: 'HBP',     title: 'Hit by pitch' },
  { key: 'sacrificeFlies',  label: 'SF',      title: 'Sacrifice flies' },
  { key: 'avg',             label: 'AVG',     title: 'Batting average (H / AB)' },
  { key: 'obp',             label: 'OBP',     title: 'On-base percentage' },
  { key: 'slg',             label: 'SLG',     title: 'Slugging percentage' },
  { key: 'ops',             label: 'OPS',     title: 'On-base plus slugging' },
  { key: 'iso',             label: 'ISO',     title: 'Isolated power (SLG − AVG)' },
  { key: 'babip',           label: 'BABIP',   title: 'Batting avg on balls in play — contact/luck indicator' },
  { key: 'kPct',            label: 'K%',      title: 'Strikeout rate (K / PA)' },
  { key: 'bbPct',           label: 'BB%',     title: 'Walk rate (BB / PA)' },
  { key: 'woba',            label: 'wOBA',    title: 'Weighted on-base average (FanGraphs 2023 weights)' },
  { key: 'hardHitBalls',    label: 'HHB',     title: 'Hard Hit Balls — line drives, deep fly balls, and home runs' },
  { key: 'hardHitPct',      label: 'HHB%',    title: 'Hard Hit Ball rate (HHB / total batted balls)' },
];

function getValue(s: BattingStats, key: SortKey): number | string {
  if (key === 'playerName') return s.playerName;
  return s[key as keyof Omit<BattingStats, 'playerId' | 'playerName'>];
}

function displayStat(s: BattingStats, key: SortKey): string {
  if (key === 'playerName') return s.playerName;

  // Integer counting stats
  const intKeys: SortKey[] = [
    'gamesAppeared', 'plateAppearances', 'atBats', 'runs', 'hits',
    'doubles', 'triples', 'homeRuns', 'rbi', 'walks', 'strikeouts',
    'hitByPitch', 'sacrificeFlies', 'battedBalls', 'hardHitBalls',
  ];
  if (intKeys.includes(key)) {
    return String(s[key as keyof typeof s]);
  }

  // Percentage stats (formatted as XX.X%)
  const pctKeys: SortKey[] = ['kPct', 'bbPct', 'hardHitPct'];
  if (pctKeys.includes(key)) {
    return formatBattingPct(s[key as keyof typeof s] as number);
  }

  // All other rate stats (.XXX format)
  return formatBattingRate(s[key as keyof typeof s] as number);
}

export function BattingStatsTable({ stats }: { stats: BattingStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('plateAppearances');
  const [sortAsc, setSortAsc] = useState(false);

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
    const af = isFinite(an) ? an : -1;
    const bf = isFinite(bn) ? bn : -1;
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
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50 transition-colors">
              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-3 tabular-nums whitespace-nowrap ${
                    col.key === 'playerName'
                      ? 'font-medium text-gray-900'
                      : 'text-gray-700'
                  }`}
                >
                  {displayStat(s, col.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
