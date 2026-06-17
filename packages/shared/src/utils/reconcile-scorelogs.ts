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

function diffLineScores(home: LineScoreData, away: LineScoreData, conflicts: ScoreConflict[]): void {
  if (home.homeRuns !== away.homeRuns) {
    conflicts.push({ kind: 'final_score', side: 'home', homeLog: home.homeRuns, awayLog: away.homeRuns });
  }
  if (home.awayRuns !== away.awayRuns) {
    conflicts.push({ kind: 'final_score', side: 'away', homeLog: home.awayRuns, awayLog: away.awayRuns });
  }

  const innings = Math.max(home.homeRunsByInning.length, away.homeRunsByInning.length);
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
