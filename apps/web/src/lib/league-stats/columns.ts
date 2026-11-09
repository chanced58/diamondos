import type { StatKey } from '@baseball/shared';
import { toStatColumns, type SortColumnSpec } from '../league-home/team-table-sort';

export type StatsTab = 'batting' | 'pitching' | 'teams';

const TABS: readonly StatsTab[] = ['batting', 'pitching', 'teams'];

/** Parse the `?tab=` search param; anything unrecognised falls back to batting. */
export function parseTab(v: string | undefined): StatsTab {
  return TABS.find((t) => t === v) ?? 'batting';
}

/** Batting columns for the team page, in display order. */
export const TEAM_BATTING_KEYS = [
  'avg', 'obp', 'slg', 'ops', 'homeRuns', 'rbi', 'hits', 'runs',
  'doubles', 'triples', 'walks', 'qabPct', 'hardHitPct',
] as const satisfies readonly StatKey[];

/** Pitching columns for the team page, in display order (IP rendered separately). */
export const TEAM_PITCHING_KEYS = ['era', 'whip', 'strikeoutsP'] as const satisfies readonly StatKey[];

export const BATTING_COLUMNS: SortColumnSpec[] = toStatColumns(
  { key: 'pa', label: 'PA', source: 'pa', field: '', format: 'int', sortDir: 'desc' },
  TEAM_BATTING_KEYS,
);

export const PITCHING_COLUMNS: SortColumnSpec[] = toStatColumns(
  { key: 'ip', label: 'IP', source: 'ip', field: '', format: 'ip', sortDir: 'desc' },
  [...TEAM_PITCHING_KEYS],
);

/** Column keys (not StatKeys: 'ip' is the IP lead column) shown as leader cards. */
export const CARD_KEYS: Record<'batting' | 'pitching', string[]> = {
  batting: ['avg', 'obp', 'homeRuns', 'rbi'],
  pitching: ['era', 'whip', 'strikeoutsP', 'ip'],
};

/**
 * Each player tab's default sort. Also the stat whose ranks (and qualifier) apply
 * while the table is sorted by player name.
 */
export const DEFAULT_SORT: Record<'batting' | 'pitching', { sortKey: string; sortDir: 'asc' | 'desc' }> = {
  batting: { sortKey: 'avg', sortDir: 'desc' },
  pitching: { sortKey: 'era', sortDir: 'asc' },
};
