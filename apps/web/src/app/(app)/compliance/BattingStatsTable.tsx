'use client';
import type { JSX } from 'react';

import { useState, useMemo } from 'react';
import type { BattingStats, StatTier } from '@baseball/shared';
import { formatBattingRate, formatBattingPct } from '@baseball/shared';

type SortKey = keyof Omit<BattingStats, 'playerId' | 'playerName'> | 'playerName';

const ALL_COLUMNS: { key: SortKey; label: string; title: string }[] = [
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

// Which columns are visible at each tier
const TIER_KEYS: Record<StatTier, Set<SortKey>> = {
  youth: new Set<SortKey>([
    'playerName', 'gamesAppeared', 'plateAppearances', 'atBats',
    'runs', 'hits', 'rbi', 'walks', 'strikeouts',
    'avg', 'obp', 'ops', 'hardHitPct',
  ]),
  high_school: new Set<SortKey>([
    'playerName', 'gamesAppeared', 'plateAppearances', 'atBats',
    'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'rbi',
    'walks', 'strikeouts', 'hitByPitch', 'sacrificeFlies',
    'avg', 'obp', 'slg', 'ops', 'iso', 'babip',
    'kPct', 'bbPct', 'woba', 'hardHitPct',
  ]),
  college: new Set<SortKey>(ALL_COLUMNS.map((c) => c.key)),
};

function getValue(s: BattingStats, key: SortKey): number | string {
  if (key === 'playerName') return s.playerName;
  return s[key as keyof Omit<BattingStats, 'playerId' | 'playerName'>];
}

function displayStat(s: BattingStats, key: SortKey): string {
  if (key === 'playerName') return s.playerName;

  const intKeys: SortKey[] = [
    'gamesAppeared', 'plateAppearances', 'atBats', 'runs', 'hits',
    'doubles', 'triples', 'homeRuns', 'rbi', 'walks', 'strikeouts',
    'hitByPitch', 'sacrificeFlies', 'battedBalls', 'hardHitBalls',
  ];
  if (intKeys.includes(key)) {
    return String(s[key as keyof typeof s]);
  }

  const pctKeys: SortKey[] = ['kPct', 'bbPct', 'hardHitPct'];
  if (pctKeys.includes(key)) {
    return formatBattingPct(s[key as keyof typeof s] as number);
  }

  return formatBattingRate(s[key as keyof typeof s] as number);
}

function computeTotals(rows: BattingStats[]): BattingStats {
  const t = rows.reduce((acc, s) => ({
    g: acc.g + s.gamesAppeared, pa: acc.pa + s.plateAppearances,
    ab: acc.ab + s.atBats, r: acc.r + s.runs, h: acc.h + s.hits,
    d: acc.d + s.doubles, tr: acc.tr + s.triples, hr: acc.hr + s.homeRuns,
    rbi: acc.rbi + s.rbi, bb: acc.bb + s.walks, k: acc.k + s.strikeouts,
    hbp: acc.hbp + s.hitByPitch, sf: acc.sf + s.sacrificeFlies, sh: acc.sh + s.sacrificeHits,
    batted: acc.batted + s.battedBalls, hhb: acc.hhb + s.hardHitBalls,
  }), { g: 0, pa: 0, ab: 0, r: 0, h: 0, d: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, hbp: 0, sf: 0, sh: 0, batted: 0, hhb: 0 });

  const singles = t.h - t.d - t.tr - t.hr;
  const tb = singles + 2 * t.d + 3 * t.tr + 4 * t.hr;
  const avg = t.ab > 0 ? t.h / t.ab : NaN;
  const slg = t.ab > 0 ? tb / t.ab : NaN;
  const obpD = t.ab + t.bb + t.hbp + t.sf;
  const obp = obpD > 0 ? (t.h + t.bb + t.hbp) / obpD : NaN;
  const ops = (isNaN(obp) || isNaN(slg)) ? NaN : obp + slg;
  const iso = (isNaN(slg) || isNaN(avg)) ? NaN : slg - avg;
  const babipD = t.ab - t.k - t.hr + t.sf;
  const babip = babipD > 0 ? (t.h - t.hr) / babipD : NaN;
  const wobaDenom = t.ab + t.bb + t.sf + t.hbp;
  const woba = wobaDenom > 0
    ? (0.69 * t.bb + 0.72 * t.hbp + 0.89 * singles + 1.27 * t.d + 1.62 * t.tr + 2.10 * t.hr) / wobaDenom
    : NaN;

  return {
    playerId: '__totals__', playerName: 'Totals',
    gamesAppeared: t.g, plateAppearances: t.pa, atBats: t.ab,
    runs: t.r, hits: t.h, doubles: t.d, triples: t.tr, homeRuns: t.hr,
    rbi: t.rbi, walks: t.bb, strikeouts: t.k, hitByPitch: t.hbp,
    sacrificeFlies: t.sf, sacrificeHits: t.sh,
    avg, obp, slg, ops, iso, babip,
    kPct: t.pa > 0 ? t.k / t.pa : NaN,
    bbPct: t.pa > 0 ? t.bb / t.pa : NaN,
    woba,
    battedBalls: t.batted, hardHitBalls: t.hhb,
    hardHitPct: t.batted > 0 ? t.hhb / t.batted : NaN,
  };
}

export function BattingStatsTable({ stats, tier = 'high_school' }: { stats: BattingStats[]; tier?: StatTier }): JSX.Element | null {
  const [sortKey, setSortKey] = useState<SortKey>('plateAppearances');
  const [sortAsc, setSortAsc] = useState(false);

  const columns = useMemo(
    () => ALL_COLUMNS.filter((col) => TIER_KEYS[tier].has(col.key)),
    [tier],
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
    const af = isFinite(an) ? an : -1;
    const bf = isFinite(bn) ? bn : -1;
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
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50 transition-colors">
              {columns.map((col) => (
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
        <tfoot>
          {(() => {
            const totals = computeTotals(sorted);
            return (
              <tr className="bg-white border-t-2 border-gray-300 font-semibold text-gray-900">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-3 tabular-nums whitespace-nowrap ${
                      col.key === 'playerName' ? 'font-bold' : ''
                    }`}
                  >
                    {col.key === 'playerName' ? 'Totals' : displayStat(totals, col.key)}
                  </td>
                ))}
              </tr>
            );
          })()}
        </tfoot>
      </table>
    </div>
  );
}
