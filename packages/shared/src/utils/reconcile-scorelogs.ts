import type { BattingStats } from '../types/batting';
import type { PitchingStats } from '../types/pitching';
import { computeLineScore, type LineScoreData } from './line-score';
import { filterResetAndReverted } from './event-filters';

/**
 * Dual-scorekeeper reconciliation.
 *
 * When a league enables dual scorekeeper, both teams score the same game on
 * their own (paired) game rows. After both games are marked done, we replay
 * each side's event log independently and diff the derived results. The home
 * team's log is canonical by default — every conflict records both values so
 * the home coach can override individual fields, but no override is required.
 *
 * This module is intentionally pure and roster-agnostic: line-score level
 * comparisons (final score, per-half-inning runs, team hits/errors) are
 * computed here straight from the event rows, while per-player batting and
 * pitching diffs are computed from pre-derived stat maps supplied by the
 * caller (which owns the roster/lineup context needed to derive them).
 */

/** A single field-level disagreement between the two logs. */
export type ScoreConflict =
  | {
      kind: 'final_score';
      side: 'home' | 'away';
      homeLog: number;
      awayLog: number;
    }
  | {
      kind: 'inning_runs';
      inning: number; // 1-based
      half: 'top' | 'bottom';
      homeLog: number;
      awayLog: number;
    }
  | {
      kind: 'team_hits' | 'team_errors';
      side: 'home' | 'away';
      homeLog: number;
      awayLog: number;
    }
  | {
      kind: 'player_batting';
      playerId: string;
      stat: BattingStatKey;
      homeLog: number | null; // null = player absent from that log
      awayLog: number | null;
    }
  | {
      kind: 'player_pitching';
      playerId: string;
      stat: PitchingStatKey;
      homeLog: number | null;
      awayLog: number | null;
    };

/**
 * A stable identity for a conflict, independent of its position in the
 * conflicts array. Overrides are keyed by this so that re-running
 * reconciliation (which may reorder/add/remove conflicts) never causes a
 * stored override to silently apply to a different conflict.
 */
export function conflictKey(c: ScoreConflict): string {
  switch (c.kind) {
    case 'final_score':
      return `final_score:${c.side}`;
    case 'inning_runs':
      return `inning_runs:${c.inning}:${c.half}`;
    case 'team_hits':
      return `team_hits:${c.side}`;
    case 'team_errors':
      return `team_errors:${c.side}`;
    case 'player_batting':
      return `player_batting:${c.playerId}:${c.stat}`;
    case 'player_pitching':
      return `player_pitching:${c.playerId}:${c.stat}`;
  }
}

/**
 * A settler's decision on one conflict, stored in
 * `game_reconciliations.resolved_overrides`: the away book's value (true) or
 * the home book's (false).
 */
export interface ReconciliationOverride {
  /** Stable conflict identity (see `conflictKey`). */
  key: string;
  useAwayValue: boolean;
}

const HALF_LABEL: Record<'top' | 'bottom', string> = { top: 'Top', bottom: 'Bottom' };

/** The player a conflict is about, or null for a line-score conflict. */
export function conflictPlayerId(c: ScoreConflict): string | null {
  return c.kind === 'player_batting' || c.kind === 'player_pitching' ? c.playerId : null;
}

/** Player names by player id, for labels; a missing id falls back to a short id. */
export type ConflictPlayerNames = Readonly<Record<string, string>>;

/** The player's name, or a short id when it isn't known. */
export function conflictPlayerLabel(playerId: string, playerNames?: ConflictPlayerNames): string {
  return playerNames?.[playerId] ?? `player ${playerId.slice(0, 8)}`;
}

/**
 * Human-readable label for one conflict, shared by the web and mobile panels.
 * Player conflicts name the player when `playerNames` has them.
 */
export function describeScoreConflict(c: ScoreConflict, playerNames?: ConflictPlayerNames): string {
  switch (c.kind) {
    case 'final_score':
      return `Final score — ${c.side === 'home' ? 'home' : 'away'} runs`;
    case 'inning_runs':
      return `Runs in ${HALF_LABEL[c.half]} ${c.inning}`;
    case 'team_hits':
      return `Team hits — ${c.side}`;
    case 'team_errors':
      return `Team errors — ${c.side}`;
    case 'player_batting':
      return `Batting · ${c.stat} (${conflictPlayerLabel(c.playerId, playerNames)})`;
    case 'player_pitching':
      return `Pitching · ${c.stat} (${conflictPlayerLabel(c.playerId, playerNames)})`;
    default:
      return 'Conflict';
  }
}

/**
 * The conflict keys whose away value is in effect. A line-score conflict
 * follows its own override; a player is settled as a whole — the result takes
 * a player's entire line from one book (`selectResultSource`) — so an away
 * override on any of a player's conflicts puts all of them on the away value.
 */
export function awayValueConflictKeys(
  conflicts: readonly ScoreConflict[],
  overrides: readonly ReconciliationOverride[],
): Set<string> {
  const awayKeys = new Set(overrides.filter((o) => o.useAwayValue).map((o) => o.key));
  const awayPlayers = new Set(
    conflicts.filter((c) => awayKeys.has(conflictKey(c))).map(conflictPlayerId).filter((id): id is string => id !== null),
  );
  return new Set(
    conflicts
      .filter((c) => awayKeys.has(conflictKey(c)) || awayPlayers.has(conflictPlayerId(c) ?? ''))
      .map(conflictKey),
  );
}

/**
 * The conflict keys someone has decided: a line-score conflict with its own
 * override, and every conflict of a player with an override on any of them
 * (one choice per player settles the player's whole line). An override either
 * way is a decision: keeping the home value is saved as `useAwayValue: false`.
 */
export function settledConflictKeys(
  conflicts: readonly ScoreConflict[],
  overrides: readonly ReconciliationOverride[],
): Set<string> {
  const decided = new Set(overrides.map((o) => o.key));
  const decidedPlayers = new Set(
    conflicts.filter((c) => decided.has(conflictKey(c))).map(conflictPlayerId).filter((id): id is string => id !== null),
  );
  return new Set(
    conflicts
      .filter((c) => decided.has(conflictKey(c)) || decidedPlayers.has(conflictPlayerId(c) ?? ''))
      .map(conflictKey),
  );
}

/** One choice to settle: a line-score conflict, or every conflict of one player. */
export interface ConflictGroup {
  /** The key a choice is saved under: the conflict's, or the player's first conflict's. */
  key: string;
  /** The player the group is about; null for a line-score conflict. */
  playerId: string | null;
  conflicts: ScoreConflict[];
}

/**
 * Groups conflicts into the choices a settler makes, in first-seen order:
 * each line-score conflict alone, and one group per player.
 */
export function groupConflictsForSettling(conflicts: readonly ScoreConflict[]): ConflictGroup[] {
  const groups: ConflictGroup[] = [];
  const byPlayer = new Map<string, ConflictGroup>();
  for (const conflict of conflicts) {
    const playerId = conflictPlayerId(conflict);
    const existing = playerId ? byPlayer.get(playerId) : undefined;
    if (existing) {
      existing.conflicts.push(conflict);
      continue;
    }
    const group: ConflictGroup = { key: conflictKey(conflict), playerId, conflicts: [conflict] };
    groups.push(group);
    if (playerId) byPlayer.set(playerId, group);
  }
  return groups;
}

export interface ScoreReconciliation {
  /** True when the two logs agree on every compared field. */
  inAgreement: boolean;
  conflicts: ScoreConflict[];
  /** The line scores each side derived, for display alongside the diff. */
  homeLogLineScore: LineScoreData;
  awayLogLineScore: LineScoreData;
}

/** Counting batting stats worth reconciling (rate stats are derived from these). */
const BATTING_STAT_KEYS = [
  'plateAppearances',
  'atBats',
  'runs',
  'hits',
  'doubles',
  'triples',
  'homeRuns',
  'rbi',
  'walks',
  'strikeouts',
  'hitByPitch',
  'sacrificeFlies',
  'sacrificeHits',
] as const;
type BattingStatKey = (typeof BATTING_STAT_KEYS)[number];

/** Counting pitching stats worth reconciling. */
const PITCHING_STAT_KEYS = [
  'inningsPitchedOuts',
  'hitsAllowed',
  'runsAllowed',
  'earnedRunsAllowed',
  'walksAllowed',
  'strikeouts',
  'hitBatters',
  'wildPitches',
] as const;
type PitchingStatKey = (typeof PITCHING_STAT_KEYS)[number];

export interface ReconcileInput {
  /** Raw game_event rows for one side, any order; reset/revert filtering applied here. */
  events: Record<string, unknown>[];
  /** Per-player batting stats already derived from this side's effective events. */
  batting?: Map<string, BattingStats>;
  /** Per-player pitching stats already derived from this side's effective events. */
  pitching?: Map<string, PitchingStats>;
}

/** Push line-score conflicts (final score, per-half-inning runs, team hits/errors). */
function diffLineScores(home: LineScoreData, away: LineScoreData, conflicts: ScoreConflict[]): void {
  if (home.homeRuns !== away.homeRuns) {
    conflicts.push({ kind: 'final_score', side: 'home', homeLog: home.homeRuns, awayLog: away.homeRuns });
  }
  if (home.awayRuns !== away.awayRuns) {
    conflicts.push({ kind: 'final_score', side: 'away', homeLog: home.awayRuns, awayLog: away.awayRuns });
  }

  // Bound the loop by the longest inning array across both logs and both
  // halves. Within one line score the top/bottom arrays grow together, but a
  // log that recorded an extra (e.g. unplayed bottom) half could be longer, so
  // take the max of all four to avoid skipping a divergent inning.
  const innings = Math.max(
    home.homeRunsByInning.length,
    home.awayRunsByInning.length,
    away.homeRunsByInning.length,
    away.awayRunsByInning.length,
  );
  for (let i = 0; i < innings; i++) {
    const hTop = home.awayRunsByInning[i] ?? 0;
    const aTop = away.awayRunsByInning[i] ?? 0;
    if (hTop !== aTop) {
      conflicts.push({ kind: 'inning_runs', inning: i + 1, half: 'top', homeLog: hTop, awayLog: aTop });
    }
    const hBot = home.homeRunsByInning[i] ?? 0;
    const aBot = away.homeRunsByInning[i] ?? 0;
    if (hBot !== aBot) {
      conflicts.push({ kind: 'inning_runs', inning: i + 1, half: 'bottom', homeLog: hBot, awayLog: aBot });
    }
  }

  if (home.homeHits !== away.homeHits) {
    conflicts.push({ kind: 'team_hits', side: 'home', homeLog: home.homeHits, awayLog: away.homeHits });
  }
  if (home.awayHits !== away.awayHits) {
    conflicts.push({ kind: 'team_hits', side: 'away', homeLog: home.awayHits, awayLog: away.awayHits });
  }
  if (home.homeErrors !== away.homeErrors) {
    conflicts.push({ kind: 'team_errors', side: 'home', homeLog: home.homeErrors, awayLog: away.homeErrors });
  }
  if (home.awayErrors !== away.awayErrors) {
    conflicts.push({ kind: 'team_errors', side: 'away', homeLog: home.awayErrors, awayLog: away.awayErrors });
  }
}

/** Push a player_batting conflict for every counting stat that differs (or is present in only one log). */
function diffBatting(
  homeMap: Map<string, BattingStats> | undefined,
  awayMap: Map<string, BattingStats> | undefined,
  conflicts: ScoreConflict[],
): void {
  if (!homeMap && !awayMap) return;
  const ids = new Set<string>([...(homeMap?.keys() ?? []), ...(awayMap?.keys() ?? [])]);
  for (const playerId of ids) {
    const h = homeMap?.get(playerId);
    const a = awayMap?.get(playerId);
    for (const stat of BATTING_STAT_KEYS) {
      const homeLog = h ? h[stat] : null;
      const awayLog = a ? a[stat] : null;
      if (homeLog !== awayLog) {
        conflicts.push({ kind: 'player_batting', playerId, stat, homeLog, awayLog });
      }
    }
  }
}

/** Push a player_pitching conflict for every counting stat that differs (or is present in only one log). */
function diffPitching(
  homeMap: Map<string, PitchingStats> | undefined,
  awayMap: Map<string, PitchingStats> | undefined,
  conflicts: ScoreConflict[],
): void {
  if (!homeMap && !awayMap) return;
  const ids = new Set<string>([...(homeMap?.keys() ?? []), ...(awayMap?.keys() ?? [])]);
  for (const playerId of ids) {
    const h = homeMap?.get(playerId);
    const a = awayMap?.get(playerId);
    for (const stat of PITCHING_STAT_KEYS) {
      const homeLog = h ? h[stat] : null;
      const awayLog = a ? a[stat] : null;
      if (homeLog !== awayLog) {
        conflicts.push({ kind: 'player_pitching', playerId, stat, homeLog, awayLog });
      }
    }
  }
}

/**
 * Reconcile the home team's score log against the away team's score log.
 *
 * @param home  The home (canonical) team's events + optional derived stats.
 * @param away  The away team's events + optional derived stats.
 */
export function reconcileScoreLogs(home: ReconcileInput, away: ReconcileInput): ScoreReconciliation {
  const homeLineScore = computeLineScore(filterResetAndReverted(home.events));
  const awayLineScore = computeLineScore(filterResetAndReverted(away.events));

  const conflicts: ScoreConflict[] = [];
  diffLineScores(homeLineScore, awayLineScore, conflicts);
  diffBatting(home.batting, away.batting, conflicts);
  diffPitching(home.pitching, away.pitching, conflicts);

  return {
    inAgreement: conflicts.length === 0,
    conflicts,
    homeLogLineScore: homeLineScore,
    awayLogLineScore: awayLineScore,
  };
}
