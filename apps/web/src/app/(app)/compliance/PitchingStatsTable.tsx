'use client';
import type { JSX } from 'react';

import { useState, useMemo } from 'react';
import type { PitchingStats, StatTier } from '@baseball/shared';
import { formatInningsPitched, formatAverage, SubscriptionTier, hasFeature, Feature } from '@baseball/shared';

type ComplianceInfo = {
  pitchCount: number;
  requiredRestDays: number | null;
  canPitchNextDay: boolean | null;
  lastGameDate: string | null;
  pitches7d?: number | null;
};

type Props = {
  stats: PitchingStats[];
  complianceMap: Record<string, ComplianceInfo>;
  today: string;
  tier?: StatTier;
  subscriptionTier?: SubscriptionTier;
};

type SortKey =
  | 'playerName'
  | 'inningsPitchedOuts'
  | 'totalPitches'
  | 'strikePercentage'
  | 'firstPitchStrikePercentage'
  | 'threeBallCountPercentage'
  | 'threeZeroCountPercentage'
  | 'era'
  | 'whip'
  | 'strikeoutsPerSeven'
  | 'walksPerSeven'
  | 'hitsAllowed'
  | 'walksAllowed'
  | 'strikeouts'
  | 'hitBatters'
  | 'wildPitches';

type ColDef = { key: SortKey; label: string; title: string; fmt: (s: PitchingStats) => string };

function pct(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '---';
  return `${(value * 100).toFixed(1)}%`;
}

function dec(value: number, decimals = 2): string {
  if (!isFinite(value) || isNaN(value)) return '---';
  return value.toFixed(decimals);
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'playerName',               label: 'Pitcher',  title: 'Pitcher name',                         fmt: (s) => s.playerName },
  { key: 'inningsPitchedOuts',       label: 'IP',       title: 'Innings pitched',                      fmt: (s) => formatInningsPitched(s.inningsPitchedOuts) },
  { key: 'totalPitches',             label: 'PC',       title: 'Pitch count',                          fmt: (s) => String(s.totalPitches) },
  { key: 'strikePercentage',         label: 'STR%',     title: 'Strike percentage',                    fmt: (s) => pct(s.strikePercentage) },
  { key: 'firstPitchStrikePercentage', label: 'FPS%',   title: 'First-pitch strike percentage',        fmt: (s) => pct(s.firstPitchStrikePercentage) },
  { key: 'threeBallCountPercentage', label: '3B%',      title: '% of PAs with a 3-ball count',         fmt: (s) => pct(s.threeBallCountPercentage) },
  { key: 'threeZeroCountPercentage', label: '30CNT',  title: '% of PAs starting with 3 straight balls (3-0 count)', fmt: (s) => pct(s.threeZeroCountPercentage) },
  { key: 'era',                      label: 'ERA',      title: 'Earned run average (per 7 innings)',    fmt: (s) => dec(s.era) },
  { key: 'whip',                     label: 'WHIP',     title: 'Walks + hits per inning pitched',       fmt: (s) => dec(s.whip) },
  { key: 'strikeoutsPerSeven',       label: 'K/7',      title: 'Strikeouts per 7 innings',             fmt: (s) => dec(s.strikeoutsPerSeven) },
  { key: 'walksPerSeven',            label: 'BB/7',     title: 'Walks per 7 innings',                  fmt: (s) => dec(s.walksPerSeven) },
  { key: 'hitsAllowed',              label: 'H',        title: 'Hits allowed',                         fmt: (s) => String(s.hitsAllowed) },
  { key: 'walksAllowed',             label: 'BB',       title: 'Walks',                                fmt: (s) => String(s.walksAllowed) },
  { key: 'strikeouts',               label: 'K',        title: 'Strikeouts',                           fmt: (s) => String(s.strikeouts) },
  { key: 'hitBatters',               label: 'HBP',      title: 'Hit batters',                          fmt: (s) => String(s.hitBatters) },
  { key: 'wildPitches',              label: 'WP',       title: 'Wild pitches',                         fmt: (s) => String(s.wildPitches) },
];

const TIER_KEYS: Record<StatTier, Set<SortKey>> = {
  youth: new Set<SortKey>([
    'playerName', 'inningsPitchedOuts', 'totalPitches',
    'strikePercentage', 'firstPitchStrikePercentage',
    'era', 'walksAllowed', 'strikeouts', 'wildPitches', 'hitBatters',
  ]),
  high_school: new Set<SortKey>([
    'playerName', 'inningsPitchedOuts', 'totalPitches',
    'strikePercentage', 'firstPitchStrikePercentage', 'threeBallCountPercentage', 'threeZeroCountPercentage',
    'era', 'whip', 'strikeoutsPerSeven', 'walksPerSeven',
    'hitsAllowed', 'walksAllowed', 'strikeouts', 'hitBatters', 'wildPitches',
  ]),
  college: new Set<SortKey>(ALL_COLUMNS.map((c) => c.key)),
};

// Columns visible on the free subscription tier (counting stats + ERA only)
const FREE_TIER_PITCHING_KEYS = new Set<SortKey>([
  'playerName', 'inningsPitchedOuts', 'totalPitches',
  'era', 'hitsAllowed', 'walksAllowed', 'strikeouts', 'hitBatters', 'wildPitches',
]);

// Ball-strike count grid
const COUNT_ROWS = [0, 1, 2, 3];
const COUNT_COLS = [0, 1, 2];

function getValue(s: PitchingStats, key: SortKey): number | string {
  if (key === 'playerName') return s.playerName;
  return s[key];
}

export function PitchingStatsTable({ stats, complianceMap, today, tier = 'high_school', subscriptionTier = SubscriptionTier.FREE }: Props): JSX.Element | null {
  const [sortKey, setSortKey] = useState<SortKey>('inningsPitchedOuts');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdvanced = hasFeature(subscriptionTier, Feature.ADVANCED_PITCHING_STATS);

  const columns = useMemo(
    () => ALL_COLUMNS.filter((col) => {
      if (!TIER_KEYS[tier].has(col.key)) return false;
      if (!isAdvanced && !FREE_TIER_PITCHING_KEYS.has(col.key)) return false;
      return true;
    }),
    [tier, isAdvanced],
  );

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
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
              Rest
            </th>
          </tr>
        </thead>
        {sorted.map((s) => {
          const compliance = complianceMap[s.playerId];
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
                  <td className="px-3 py-3 whitespace-nowrap">
                    <ComplianceBadge compliance={compliance} today={today} />
                  </td>
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-6 py-4 bg-gray-50 border-t border-gray-100">
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
                {col.key === 'playerName' ? 'Totals' : computePitchingTotal(sorted, col)}
              </td>
            ))}
            <td className="px-3 py-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function computePitchingTotal(rows: PitchingStats[], col: ColDef): string {
  const t = rows.reduce((acc, s) => ({
    ip: acc.ip + s.inningsPitchedOuts,
    pc: acc.pc + s.totalPitches,
    str: acc.str + s.strikes,
    fps: acc.fps + s.firstPitchStrikes,
    tpa: acc.tpa + s.totalPAs,
    tb3: acc.tb3 + s.threeBallCountPAs,
    t30: acc.t30 + s.threeZeroCountPAs,
    h: acc.h + s.hitsAllowed,
    r: acc.r + s.runsAllowed,
    bb: acc.bb + s.walksAllowed,
    k: acc.k + s.strikeouts,
    hbp: acc.hbp + s.hitBatters,
    wp: acc.wp + s.wildPitches,
  }), { ip: 0, pc: 0, str: 0, fps: 0, tpa: 0, tb3: 0, t30: 0, h: 0, r: 0, bb: 0, k: 0, hbp: 0, wp: 0 });

  const ipDec = t.ip / 3;
  switch (col.key) {
    case 'inningsPitchedOuts': return formatInningsPitched(t.ip);
    case 'totalPitches': return String(t.pc);
    case 'strikePercentage': return pct(t.pc > 0 ? t.str / t.pc : NaN);
    case 'firstPitchStrikePercentage': return pct(t.tpa > 0 ? t.fps / t.tpa : NaN);
    case 'threeBallCountPercentage': return pct(t.tpa > 0 ? t.tb3 / t.tpa : NaN);
    case 'threeZeroCountPercentage': return pct(t.tpa > 0 ? t.t30 / t.tpa : NaN);
    case 'era': return dec(ipDec > 0 ? (t.r * 7) / ipDec : NaN);
    case 'whip': return dec(ipDec > 0 ? (t.bb + t.h) / ipDec : NaN);
    case 'strikeoutsPerSeven': return dec(ipDec > 0 ? (t.k * 7) / ipDec : NaN);
    case 'walksPerSeven': return dec(ipDec > 0 ? (t.bb * 7) / ipDec : NaN);
    case 'hitsAllowed': return String(t.h);
    case 'walksAllowed': return String(t.bb);
    case 'strikeouts': return String(t.k);
    case 'hitBatters': return String(t.hbp);
    case 'wildPitches': return String(t.wp);
    default: return '';
  }
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

  const { requiredRestDays, canPitchNextDay, lastGameDate, pitches7d } = compliance;
  const weekly =
    pitches7d != null ? (
      <span className="ml-1 text-[10px] font-normal text-gray-500">· {pitches7d} 7d</span>
    ) : null;

  if (requiredRestDays == null || requiredRestDays === 0 || canPitchNextDay) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        Eligible{weekly}
      </span>
    );
  }

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
        Eligible{weekly}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
      {daysRemaining}d rest{weekly}
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
