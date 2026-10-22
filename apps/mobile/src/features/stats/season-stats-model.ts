import {
  battingTotals,
  formatSeasonStat,
  pitcherRestStatusAt,
  pitchingTotals,
  visibleBattingColumns,
  visiblePitchingColumns,
  type CatcherInningsRow,
  type OpponentBattingRow,
  type PitcherCompliance,
  type SeasonBattingRow,
  type SeasonPitcher,
  type SeasonPitchingRow,
  type SeasonStatColumn,
  type StatFormat,
  type StatTier,
} from '@baseball/shared';
import { NAME_COLUMN_KEY, type StatColumn } from './StatTable';

/**
 * The season Stats tab's columns, totals, rest labels and sorting, as pure
 * data. Which columns show (stat tier, plan) and how each formats come from
 * `season-stat-columns` in @baseball/shared, the same module as the web
 * Stats page.
 */

/** The web TierToggle's labels. */
export const TIER_OPTIONS = [
  { value: 'youth', label: 'Basic' },
  { value: 'high_school', label: 'Standard' },
  { value: 'college', label: 'Advanced' },
] as const satisfies ReadonlyArray<{ value: StatTier; label: string }>;

export interface SortState {
  key: string;
  ascending: boolean;
}

type Totals = Record<string, string | number>;

function toStatColumns<Row, K extends string>(
  columns: SeasonStatColumn<K>[],
  pick: (row: Row, key: K) => number | null,
): StatColumn<Row>[] {
  return columns.map((col) => ({ key: col.key, label: col.label, value: (row) => formatSeasonStat(pick(row, col.key), col.format) }));
}

function formatTotals<K extends string>(columns: SeasonStatColumn<K>[], totals: Record<K, number>): Totals {
  return Object.fromEntries(columns.map((col) => [col.key, formatSeasonStat(totals[col.key], col.format)]));
}

// ── Hitting ─────────────────────────────────────────────────────────────────

export function seasonBattingColumns(tier: StatTier, advanced: boolean): StatColumn<SeasonBattingRow>[] {
  return toStatColumns(visibleBattingColumns(tier, advanced), (row: SeasonBattingRow, key) => row[key]);
}

export function seasonBattingTotals(rows: SeasonBattingRow[], tier: StatTier, advanced: boolean): Totals {
  return formatTotals(visibleBattingColumns(tier, advanced), battingTotals(rows));
}

// ── Pitching ────────────────────────────────────────────────────────────────

export interface RestLabel {
  /** Fits a table cell: "OK", "2d" or "—". */
  short: string;
  long: string;
  resting: boolean;
}

/** A pitcher's rest status at `now` from their latest outing, counting days in its game's time zone. */
export function restLabel(compliance: PitcherCompliance | null, now: Date): RestLabel {
  if (!compliance) return { short: '—', long: 'No pitch count on record', resting: false };
  const rest = pitcherRestStatusAt(compliance, now);
  if (rest.eligible) return { short: 'OK', long: 'Eligible to pitch', resting: false };
  const days = rest.daysRemaining;
  return { short: `${days}d`, long: `${days} more rest ${days === 1 ? 'day' : 'days'} required`, resting: true };
}

/** The pitching stat columns alone — the league table, where rest is per team and not shown. */
export function pitchingStatColumns(tier: StatTier, advanced: boolean): StatColumn<SeasonPitchingRow>[] {
  return toStatColumns(visiblePitchingColumns(tier, advanced), (row: SeasonPitchingRow, key) => row[key]);
}

export function seasonPitchingColumns(tier: StatTier, advanced: boolean, now: Date): StatColumn<SeasonPitcher>[] {
  return [
    ...pitchingStatColumns(tier, advanced),
    {
      key: 'rest',
      label: 'Rest',
      value: (row) => restLabel(row.compliance, now).short,
      emphasize: (row) => restLabel(row.compliance, now).resting,
    },
    { key: 'pitches7d', label: '7d', value: (row) => row.compliance?.pitches7d ?? '—' },
  ];
}

export function seasonPitchingTotals(rows: SeasonPitchingRow[], tier: StatTier, advanced: boolean): Totals {
  return formatTotals(visiblePitchingColumns(tier, advanced), pitchingTotals(rows));
}

/** What a pitching column sorts by, including the rest and 7-day columns. */
export function pitcherSortValue(row: SeasonPitcher, key: string, now: Date): number | null {
  if (key === 'rest') {
    if (!row.compliance) return null;
    const rest = pitcherRestStatusAt(row.compliance, now);
    return rest.eligible ? 0 : rest.daysRemaining;
  }
  if (key === 'pitches7d') return row.compliance?.pitches7d ?? null;
  return statValue(row, key);
}

// ── Catcher ─────────────────────────────────────────────────────────────────

/** Whole innings plain, partial ones to two places (the web's format). */
export function formatInnings(innings: number): string {
  return (Math.round(innings * 100) / 100).toFixed(innings % 1 === 0 ? 0 : 2);
}

/** "10/20" from "2026-10-20". */
function shortDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const [, month, day] = isoDate.split('-').map(Number);
  return `${month}/${day}`;
}

export const CATCHER_COLUMNS: StatColumn<CatcherInningsRow>[] = [
  { key: 'totalInnings', label: 'INN', value: (r) => formatInnings(r.totalInnings) },
  { key: 'games', label: 'G', value: (r) => r.games },
  { key: 'perGame', label: 'INN/G', value: (r) => (r.games > 0 ? formatInnings(r.totalInnings / r.games) : '—') },
  { key: 'lastGameDate', label: 'Last', value: (r) => shortDate(r.lastGameDate) },
];

export function catcherSortValue(row: CatcherInningsRow, key: string): number | string | null {
  if (key === 'perGame') return row.games > 0 ? row.totalInnings / row.games : null;
  if (key === 'lastGameDate') return row.lastGameDate;
  return statValue(row, key);
}

// ── Opponents ───────────────────────────────────────────────────────────────

const OPPONENT_BATTING: { key: keyof OpponentBattingRow & string; label: string; format: StatFormat }[] = [
  { key: 'pa', label: 'PA', format: 'int' },
  { key: 'ab', label: 'AB', format: 'int' },
  { key: 'h', label: 'H', format: 'int' },
  { key: 'doubles', label: '2B', format: 'int' },
  { key: 'triples', label: '3B', format: 'int' },
  { key: 'hr', label: 'HR', format: 'int' },
  { key: 'rbi', label: 'RBI', format: 'int' },
  { key: 'bb', label: 'BB', format: 'int' },
  { key: 'k', label: 'K', format: 'int' },
  { key: 'sb', label: 'SB', format: 'int' },
  { key: 'avg', label: 'AVG', format: 'rate' },
  { key: 'obp', label: 'OBP', format: 'rate' },
  { key: 'slg', label: 'SLG', format: 'rate' },
];

export const OPPONENT_BATTING_COLUMNS: StatColumn<OpponentBattingRow>[] = OPPONENT_BATTING.map((col) => ({
  key: col.key,
  label: col.label,
  value: (row) => formatSeasonStat(row[col.key] as number | null, col.format),
}));

export function opponentBattingTotals(rows: OpponentBattingRow[]): Totals {
  const total = (key: keyof OpponentBattingRow) => rows.reduce((sum, row) => sum + (row[key] as number), 0);
  const [ab, h, doubles, triples, hr, bb, hbp, sf] = (['ab', 'h', 'doubles', 'triples', 'hr', 'bb', 'hbp', 'sf'] as const).map(total);
  const totalBases = h + doubles + 2 * triples + 3 * hr;
  const obpDenominator = ab + bb + hbp + sf;
  const counts = Object.fromEntries(
    OPPONENT_BATTING.filter((col) => col.format === 'int').map((col) => [col.key, total(col.key)]),
  );
  return {
    ...counts,
    avg: formatSeasonStat(ab > 0 ? h / ab : null, 'rate'),
    obp: formatSeasonStat(obpDenominator > 0 ? (h + bb + hbp) / obpDenominator : null, 'rate'),
    slg: formatSeasonStat(ab > 0 ? totalBases / ab : null, 'rate'),
  };
}

const OPPONENT_PITCHING: { key: keyof SeasonPitchingRow & string; label: string; format: StatFormat }[] = [
  { key: 'inningsPitchedOuts', label: 'IP', format: 'ip' },
  { key: 'hitsAllowed', label: 'H', format: 'int' },
  { key: 'runsAllowed', label: 'R', format: 'int' },
  { key: 'walksAllowed', label: 'BB', format: 'int' },
  { key: 'strikeouts', label: 'K', format: 'int' },
  { key: 'hitBatters', label: 'HBP', format: 'int' },
  { key: 'wildPitches', label: 'WP', format: 'int' },
  { key: 'totalPitches', label: 'PC', format: 'int' },
  { key: 'strikePercentage', label: 'STR%', format: 'pct' },
  { key: 'era', label: 'ERA', format: 'dec' },
];

export const OPPONENT_PITCHING_COLUMNS: StatColumn<SeasonPitchingRow>[] = OPPONENT_PITCHING.map((col) => ({
  key: col.key,
  label: col.label,
  value: (row) => formatSeasonStat(row[col.key] as number | null, col.format),
}));

export function opponentPitchingTotals(rows: SeasonPitchingRow[]): Totals {
  const totals = pitchingTotals(rows);
  const runs = rows.reduce((sum, row) => sum + row.runsAllowed, 0);
  return Object.fromEntries(
    OPPONENT_PITCHING.map((col) => [
      col.key,
      col.key === 'runsAllowed' ? runs : formatSeasonStat(totals[col.key as keyof typeof totals], col.format),
    ]),
  );
}

/** "8-3" or "8-3-1" with ties. */
export function formatRecord(record: { wins: number; losses: number; ties: number }): string {
  return record.ties > 0 ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`;
}

// ── Sorting ─────────────────────────────────────────────────────────────────

/** A row's numeric stat for sorting; null when missing or not computable. */
export function statValue(row: object, key: string): number | null {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Rows sorted by a column. Rows with no value (no at-bats, no outs) sort
 * last either way, so a descending sort leads with real numbers.
 */
export function sortStatRows<Row>(
  rows: Row[],
  sort: SortState,
  name: (row: Row) => string,
  value: (row: Row, key: string) => number | string | null,
): Row[] {
  const direction = sort.ascending ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === NAME_COLUMN_KEY) return direction * name(a).localeCompare(name(b));
    const av = value(a, sort.key);
    const bv = value(b, sort.key);
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
    if (typeof av === 'string' || typeof bv === 'string') return direction * String(av).localeCompare(String(bv));
    return direction * (av - bv);
  });
}

/** Tapping a column: the same column flips direction; a new one starts high-to-low (names A–Z). */
export function nextSort(current: SortState, key: string): SortState {
  if (current.key === key) return { key, ascending: !current.ascending };
  return { key, ascending: key === NAME_COLUMN_KEY };
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** A YYYY-MM-DD day shifted by whole days. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** "Fri, Oct 24" for a YYYY-MM-DD day, whatever the device's zone. */
export function formatPlanDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
