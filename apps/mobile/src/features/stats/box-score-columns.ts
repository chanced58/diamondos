import {
  formatInningsPitched,
  type BoxScoreBatter,
  type BoxScoreFielder,
  type BoxScorePitcher,
} from '@baseball/shared';
import type { StatColumn } from './StatTable';

/**
 * The box score's columns and totals — the web stats page's columns, as pure
 * data so the formatting is testable without rendering.
 */

/** ".333", or "---" when there's no rate (no at-bats). */
export function formatRate(value: number | null): string {
  if (value === null) return '---';
  return value >= 1 ? value.toFixed(3) : value.toFixed(3).replace(/^0/, '');
}

/** "3.00", or "---" when there's no rate (no outs recorded). */
export function formatEra(value: number | null): string {
  return value === null ? '---' : value.toFixed(2);
}

/** "62%", or "---" with no pitches. */
export function formatPercent(value: number | null): string {
  return value === null ? '---' : `${Math.round(value * 100)}%`;
}

const sum = <Row>(rows: Row[], pick: (row: Row) => number) => rows.reduce((total, row) => total + pick(row), 0);

export const BATTING_COLUMNS: StatColumn<BoxScoreBatter>[] = [
  { key: 'ab', label: 'AB', value: (r) => r.ab },
  { key: 'r', label: 'R', value: (r) => r.r },
  { key: 'h', label: 'H', value: (r) => r.h },
  { key: 'doubles', label: '2B', value: (r) => r.doubles },
  { key: 'triples', label: '3B', value: (r) => r.triples },
  { key: 'hr', label: 'HR', value: (r) => r.hr },
  { key: 'rbi', label: 'RBI', value: (r) => r.rbi },
  { key: 'bb', label: 'BB', value: (r) => r.bb },
  { key: 'k', label: 'K', value: (r) => r.k },
  { key: 'sb', label: 'SB', value: (r) => r.sb },
  { key: 'avg', label: 'AVG', value: (r) => formatRate(r.avg) },
];

export function battingTotals(rows: BoxScoreBatter[]): Record<string, string | number> {
  const ab = sum(rows, (r) => r.ab);
  const h = sum(rows, (r) => r.h);
  return {
    ab,
    r: sum(rows, (r) => r.r),
    h,
    doubles: sum(rows, (r) => r.doubles),
    triples: sum(rows, (r) => r.triples),
    hr: sum(rows, (r) => r.hr),
    rbi: sum(rows, (r) => r.rbi),
    bb: sum(rows, (r) => r.bb),
    k: sum(rows, (r) => r.k),
    sb: sum(rows, (r) => r.sb),
    avg: formatRate(ab > 0 ? h / ab : null),
  };
}

export const PITCHING_COLUMNS: StatColumn<BoxScorePitcher>[] = [
  { key: 'ip', label: 'IP', value: (r) => formatInningsPitched(r.inningsPitchedOuts) },
  { key: 'bf', label: 'BF', value: (r) => r.battersFaced },
  { key: 'h', label: 'H', value: (r) => r.h },
  { key: 'r', label: 'R', value: (r) => r.r },
  { key: 'er', label: 'ER', value: (r) => r.er },
  { key: 'bb', label: 'BB', value: (r) => r.bb },
  { key: 'k', label: 'K', value: (r) => r.k },
  { key: 'hbp', label: 'HBP', value: (r) => r.hbp },
  { key: 'wp', label: 'WP', value: (r) => r.wp },
  { key: 'pc', label: 'PC', value: (r) => r.pitches },
  { key: 'strike', label: 'K%', value: (r) => formatPercent(r.strikePct) },
  { key: 'tz', label: '3-0', value: (r) => r.threeZeroCounts },
  { key: 'era', label: 'ERA', value: (r) => formatEra(r.era) },
];

export function pitchingTotals(rows: BoxScorePitcher[]): Record<string, string | number> {
  return {
    ip: formatInningsPitched(sum(rows, (r) => r.inningsPitchedOuts)),
    bf: sum(rows, (r) => r.battersFaced),
    h: sum(rows, (r) => r.h),
    r: sum(rows, (r) => r.r),
    er: sum(rows, (r) => r.er),
    bb: sum(rows, (r) => r.bb),
    k: sum(rows, (r) => r.k),
    hbp: sum(rows, (r) => r.hbp),
    wp: sum(rows, (r) => r.wp),
    pc: sum(rows, (r) => r.pitches),
  };
}

export const FIELDING_COLUMNS: StatColumn<BoxScoreFielder>[] = [
  { key: 'pos', label: 'POS', value: (r) => r.position || '—' },
  { key: 'po', label: 'PO', value: (r) => r.po },
  { key: 'a', label: 'A', value: (r) => r.a },
  { key: 'e', label: 'E', value: (r) => r.e, emphasize: (r) => r.e > 0 },
  {
    key: 'fpct',
    label: 'FPCT',
    value: (r) => {
      const chances = r.po + r.a + r.e;
      return formatRate(chances > 0 ? (r.po + r.a) / chances : null);
    },
  },
];

export function fieldingTotals(rows: BoxScoreFielder[]): Record<string, string | number> {
  const po = sum(rows, (r) => r.po);
  const a = sum(rows, (r) => r.a);
  const e = sum(rows, (r) => r.e);
  const chances = po + a + e;
  return { po, a, e, fpct: formatRate(chances > 0 ? (po + a) / chances : null) };
}
