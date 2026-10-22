'use client';
import type { JSX } from 'react';

import { useState, useMemo } from 'react';
import type { BattingStats, SeasonBattingStatKey, SeasonStatColumn, StatTier } from '@baseball/shared';
import {
  battingTotals,
  formatSeasonStat,
  SubscriptionTier,
  hasFeature,
  Feature,
  visibleBattingColumns,
} from '@baseball/shared';

type SortKey = SeasonBattingStatKey | 'playerName';

// Columns, their tier and plan visibility, formatting and totals come from
// @baseball/shared (season-stat-columns), shared with the mobile Stats tab.

function getValue(s: BattingStats, key: SortKey): number | string {
  if (key === 'playerName') return s.playerName;
  return s[key];
}

function displayStat(values: Record<SeasonBattingStatKey, number>, col: SeasonStatColumn<SeasonBattingStatKey>): string {
  return formatSeasonStat(values[col.key], col.format);
}

export function BattingStatsTable({ stats, tier = 'high_school', subscriptionTier = SubscriptionTier.FREE }: { stats: BattingStats[]; tier?: StatTier; subscriptionTier?: SubscriptionTier }): JSX.Element | null {
  const [sortKey, setSortKey] = useState<SortKey>('plateAppearances');
  const [sortAsc, setSortAsc] = useState(false);

  const isAdvanced = hasFeature(subscriptionTier, Feature.ADVANCED_BATTING_STATS);

  const columns = useMemo(() => visibleBattingColumns(tier, isAdvanced), [tier, isAdvanced]);

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

  const headerClass = (key: SortKey) =>
    `px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-gray-900 transition-colors ${
      sortKey === key ? 'text-brand-700' : ''
    }`;
  const sortArrow = (key: SortKey) => sortKey === key && <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>;
  const totals = battingTotals(sorted);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th title="Player name" onClick={() => handleSort('playerName')} className={headerClass('playerName')}>
              Batter
              {sortArrow('playerName')}
            </th>
            {columns.map((col) => (
              <th key={col.key} title={col.title} onClick={() => handleSort(col.key)} className={headerClass(col.key)}>
                {col.label}
                {sortArrow(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50 transition-colors">
              <td className="px-3 py-3 tabular-nums whitespace-nowrap font-medium text-gray-900">{s.playerName}</td>
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-3 tabular-nums whitespace-nowrap text-gray-700">
                  {displayStat(s, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-white border-t-2 border-gray-300 font-semibold text-gray-900">
            <td className="px-3 py-3 tabular-nums whitespace-nowrap font-bold">Totals</td>
            {columns.map((col) => (
              <td key={col.key} className="px-3 py-3 tabular-nums whitespace-nowrap">
                {displayStat(totals, col)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
