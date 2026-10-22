'use client';
import type { JSX } from 'react';

import { useState, useMemo } from 'react';
import type { PitchingStats, SeasonPitchingStatKey, StatFormat, StatTier } from '@baseball/shared';
import {
  formatAverage,
  formatSeasonStat,
  pitcherRestStatusAt,
  pitchingTotals,
  SubscriptionTier,
  hasFeature,
  Feature,
  visiblePitchingColumns,
} from '@baseball/shared';

type ComplianceInfo = {
  pitchCount: number;
  requiredRestDays: number | null;
  canPitchNextDay: boolean | null;
  lastGameDate: string | null;
  timeZone?: string | null;
  pitches7d?: number | null;
};

type Props = {
  stats: PitchingStats[];
  /** Omit (with `now`) to hide the Rest column, e.g. outside the compliance page. */
  complianceMap?: Record<string, ComplianceInfo>;
  /** The page's render time (ISO); each pitcher's rest counts days in their outing's time zone. */
  now?: string;
  tier?: StatTier;
  subscriptionTier?: SubscriptionTier;
};

type SortKey = SeasonPitchingStatKey | 'playerName';

type ColDef = { key: SortKey; label: string; title: string; format?: StatFormat; fmt: (s: PitchingStats) => string };

function pct(value: number): string {
  return formatSeasonStat(value, 'pct');
}

// Stat columns, their tier and plan visibility, formatting and totals come
// from @baseball/shared (season-stat-columns), shared with the mobile Stats tab.
const NAME_COLUMN: ColDef = { key: 'playerName', label: 'Pitcher', title: 'Pitcher name', fmt: (s) => s.playerName };

function statColumns(tier: StatTier, advanced: boolean): ColDef[] {
  return [
    NAME_COLUMN,
    ...visiblePitchingColumns(tier, advanced).map((col) => ({
      key: col.key,
      label: col.label,
      title: col.title,
      format: col.format,
      fmt: (s: PitchingStats) => formatSeasonStat(s[col.key], col.format),
    })),
  ];
}

// Ball-strike count grid
const COUNT_ROWS = [0, 1, 2, 3];
const COUNT_COLS = [0, 1, 2];

function getValue(s: PitchingStats, key: SortKey): number | string {
  if (key === 'playerName') return s.playerName;
  return s[key];
}

export function PitchingStatsTable({ stats, complianceMap, now, tier = 'high_school', subscriptionTier = SubscriptionTier.FREE }: Props): JSX.Element | null {
  const [sortKey, setSortKey] = useState<SortKey>('inningsPitchedOuts');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdvanced = hasFeature(subscriptionTier, Feature.ADVANCED_PITCHING_STATS);
  const rest = complianceMap && now ? { complianceMap, now: new Date(now) } : null;

  const columns = useMemo(() => statColumns(tier, isAdvanced), [tier, isAdvanced]);

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
    const af = isFinite(an) ? an : 1e10;
    const bf = isFinite(bn) ? bn : 1e10;
    return sortAsc ? af - bf : bf - af;
  });
  const totals = pitchingTotals(sorted);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map((col) => (
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
            {rest && (
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                Rest
              </th>
            )}
          </tr>
        </thead>
        {sorted.map((s) => {
          const isExpanded = expandedId === s.playerId;

          return (
            <tbody key={s.playerId} className="bg-white divide-y divide-gray-100">
              <tr
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : s.playerId)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-3 tabular-nums whitespace-nowrap ${
                        col.key === 'playerName' ? 'font-medium text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      {col.key === 'playerName' ? (
                        <>
                          <span className="text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                            {s.playerName}
                          </span>
                          <span className="ml-2 text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                        </>
                      ) : (
                        col.fmt(s)
                      )}
                    </td>
                  ))}
                  {rest && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <ComplianceBadge compliance={rest.complianceMap[s.playerId]} now={rest.now} />
                    </td>
                  )}
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={columns.length + (rest ? 1 : 0)} className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                      <BaByCountGrid stats={s} />
                    </td>
                  </tr>
              )}
            </tbody>
          );
        })}
        <tfoot>
          <tr className="bg-white border-t-2 border-gray-300 font-semibold text-gray-900">
            {columns.map((col) => (
              <td
                key={col.key}
                className={`px-3 py-3 tabular-nums whitespace-nowrap ${
                  col.key === 'playerName' ? 'font-bold' : ''
                }`}
              >
                {col.key === 'playerName' || !col.format ? 'Totals' : formatSeasonStat(totals[col.key], col.format)}
              </td>
            ))}
            {rest && <td className="px-3 py-3" />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ComplianceBadge({
  compliance,
  now,
}: {
  compliance: ComplianceInfo | undefined;
  now: Date;
}) {
  if (!compliance) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const { pitches7d } = compliance;
  const weekly =
    pitches7d != null ? (
      <span className="ml-1 text-[10px] font-normal text-gray-500">· {pitches7d} 7d</span>
    ) : null;

  const rest = pitcherRestStatusAt(compliance, now);
  if (rest.eligible) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        Eligible{weekly}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
      {rest.daysRemaining}d rest{weekly}
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
        <div className="flex">
          <div className="w-16" />
          {COUNT_COLS.map((s) => (
            <div key={s} className="w-16 text-center text-xs font-semibold text-gray-500 pb-1">
              {s} str
            </div>
          ))}
        </div>
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
