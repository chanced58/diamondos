import type { BattingStats } from '../types/batting';
import type { PitchingStats } from '../types/pitching';
import { finalizeBattingRates } from './batting-stats';
import { finalizePitchingRates } from './pitching-stats';
import { conflictKey, type ReconciliationOverride, type ScoreConflict } from './reconcile-scorelogs';

type Side = 'home' | 'away';

/** Where the result of a league game comes from. */
export type ResultSource =
  | { kind: 'none' }
  | { kind: 'manual' }
  | { kind: 'single'; side: Side }
  | { kind: 'dual'; scoreFrom: Side; playerLineFrom: ReadonlyMap<string, Side> };

interface BookState {
  completed: boolean;
  eventCount: number;
}

/**
 * Whether a team's row of a league game holds a finished book of its own: its
 * team completed it, so it carries no written league result (`result_source`
 * `paired` / `manual`). A row completed by a written result may still be
 * receiving its team's live events; its book counts only once the team
 * finalizes it and the result source is cleared.
 */
export function isFinishedBook(row: { status: string; result_source: string | null } | null): boolean {
  return row !== null && row.status === 'completed' && row.result_source === null;
}

/** A scorebook counts only when its game is completed and it recorded events. */
function bookCounts(book: BookState): boolean {
  return book.completed && book.eventCount > 0;
}

/** Keys of the overrides in which the home coach took the away book's value. */
function awayOverrideKeys(overrides: readonly ReconciliationOverride[]): Set<string> {
  return new Set(overrides.filter((o) => o.useAwayValue).map((o) => o.key));
}

function dualSource(
  conflicts: readonly ScoreConflict[],
  overrides: readonly ReconciliationOverride[],
): ResultSource {
  const awayKeys = awayOverrideKeys(overrides);
  let scoreFrom: Side = 'home';
  const playerLineFrom = new Map<string, Side>();
  for (const conflict of conflicts) {
    if (!awayKeys.has(conflictKey(conflict))) continue;
    if (conflict.kind === 'final_score') scoreFrom = 'away';
    else if (conflict.kind === 'player_batting' || conflict.kind === 'player_pitching') {
      playerLineFrom.set(conflict.playerId, 'away');
    }
  }
  return { kind: 'dual', scoreFrom, playerLineFrom };
}

/**
 * Decide which result counts for a league game. Scorebooks always beat a
 * hand-entered result; with both books, the home book is canonical except where
 * the home coach accepted the away value.
 */
export function selectResultSource(input: {
  home: BookState;
  away: BookState;
  reconciliation: { conflicts: ScoreConflict[]; overrides: ReconciliationOverride[] } | null;
  hasManualResult: boolean;
}): ResultSource {
  const homeCounts = bookCounts(input.home);
  const awayCounts = bookCounts(input.away);
  if (homeCounts && awayCounts) {
    const { conflicts = [], overrides = [] } = input.reconciliation ?? {};
    return dualSource(conflicts, overrides);
  }
  if (homeCounts) return { kind: 'single', side: 'home' };
  if (awayCounts) return { kind: 'single', side: 'away' };
  return input.hasManualResult ? { kind: 'manual' } : { kind: 'none' };
}

/** A team's W-L-T record and run differential. */
export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  runsFor: number;
  runsAgainst: number;
  winPct: number;
}

export interface LeagueGameResult {
  homeTeamId: string;
  awayTeamId: string;
  homeRuns: number;
  awayRuns: number;
  /** Set when the game was forfeited: that team is credited the win. */
  forfeitWinnerTeamId: string | null;
}

function emptyRecord(): TeamRecord {
  return { wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, winPct: 0 };
}

function recordFor(records: Map<string, TeamRecord>, teamId: string): TeamRecord {
  const existing = records.get(teamId);
  if (existing) return existing;
  const created = emptyRecord();
  records.set(teamId, created);
  return created;
}

function addPlayedGame(record: TeamRecord, runsFor: number, runsAgainst: number): void {
  record.runsFor += runsFor;
  record.runsAgainst += runsAgainst;
  if (runsFor > runsAgainst) record.wins++;
  else if (runsFor < runsAgainst) record.losses++;
  else record.ties++;
}

/**
 * Tally W/L/T and runs per team from league game results. A forfeit is a win
 * for the winner and a loss for the other team, with no runs added. Teams in
 * `teamIds` are seeded so teams without games still appear.
 */
export function computeLeagueGameStandings(
  results: readonly LeagueGameResult[],
  teamIds: readonly string[],
): Map<string, TeamRecord> {
  const records = new Map<string, TeamRecord>();
  for (const teamId of teamIds) records.set(teamId, emptyRecord());

  for (const game of results) {
    const home = recordFor(records, game.homeTeamId);
    const away = recordFor(records, game.awayTeamId);
    if (game.forfeitWinnerTeamId) {
      const homeWon = game.forfeitWinnerTeamId === game.homeTeamId;
      (homeWon ? home : away).wins++;
      (homeWon ? away : home).losses++;
      continue;
    }
    addPlayedGame(home, game.homeRuns, game.awayRuns);
    addPlayedGame(away, game.awayRuns, game.homeRuns);
  }

  for (const record of records.values()) {
    const games = record.wins + record.losses + record.ties;
    record.winPct = games === 0 ? 0 : Number((record.wins / games).toFixed(4));
  }
  return records;
}

/** A batting line typed in by hand for a game nobody scored pitch by pitch. */
export interface ManualBattingLine {
  playerId: string;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  hbp: number;
  sf: number;
  sb: number;
}

function lineToBattingStats(line: ManualBattingLine): BattingStats {
  const stats: BattingStats = {
    playerId: line.playerId,
    playerName: '',
    gamesAppeared: 1,
    plateAppearances: line.ab + line.bb + line.hbp + line.sf,
    atBats: line.ab,
    runs: line.r,
    hits: line.h,
    doubles: line.doubles,
    triples: line.triples,
    homeRuns: line.hr,
    rbi: line.rbi,
    walks: line.bb,
    strikeouts: line.so,
    hitByPitch: line.hbp,
    sacrificeFlies: line.sf,
    sacrificeHits: 0,
    avg: NaN,
    obp: NaN,
    slg: NaN,
    ops: NaN,
    iso: NaN,
    babip: NaN,
    kPct: NaN,
    bbPct: NaN,
    woba: NaN,
    battedBalls: 0,
    hardHitBalls: 0,
    hardHitPct: NaN,
    qab: 0,
    qabPct: NaN,
    // A hand-entered line has no pitch-level data, so it stays out of the QAB rate.
    qabPlateAppearances: 0,
  };
  finalizeBattingRates(stats);
  return stats;
}

/** Batting stats per player from hand-entered lines (several lines for one player are summed). */
export function manualLinesToBattingStats(lines: readonly ManualBattingLine[]): Map<string, BattingStats> {
  const byPlayer = new Map<string, BattingStats>();
  for (const line of lines) {
    const stats = lineToBattingStats(line);
    const existing = byPlayer.get(line.playerId);
    byPlayer.set(line.playerId, existing ? mergeBattingStats(existing, stats) : stats);
  }
  return byPlayer;
}

const BATTING_COUNT_KEYS = [
  'gamesAppeared',
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
  'battedBalls',
  'hardHitBalls',
  'qab',
] as const satisfies readonly (keyof BattingStats)[];

/** Sum two batting lines' counts and recompute the rates the way the reducer does. */
export function mergeBattingStats(a: BattingStats, b: BattingStats): BattingStats {
  const merged: BattingStats = { ...a, playerName: a.playerName || b.playerName };
  for (const key of BATTING_COUNT_KEYS) merged[key] = a[key] + b[key];
  merged.qabPlateAppearances =
    (a.qabPlateAppearances ?? a.plateAppearances) + (b.qabPlateAppearances ?? b.plateAppearances);
  finalizeBattingRates(merged);
  return merged;
}

const PITCHING_COUNT_KEYS = [
  'gamesAppeared',
  'inningsPitchedOuts',
  'totalPitches',
  'strikes',
  'balls',
  'firstPitchStrikes',
  'threeBallCountPAs',
  'threeZeroCountPAs',
  'totalPAs',
  'hitsAllowed',
  'runsAllowed',
  'earnedRunsAllowed',
  'walksAllowed',
  'strikeouts',
  'hitBatters',
  'wildPitches',
] as const satisfies readonly (keyof PitchingStats)[];

/** Sum two pitching lines' counts and recompute the rates the way the reducer does. */
export function mergePitchingStats(a: PitchingStats, b: PitchingStats): PitchingStats {
  const merged: PitchingStats = { ...a, playerName: a.playerName || b.playerName, baByCount: {} };
  for (const key of PITCHING_COUNT_KEYS) merged[key] = a[key] + b[key];
  const noCount = { atBats: 0, hits: 0, average: NaN };
  for (const count of new Set([...Object.keys(a.baByCount), ...Object.keys(b.baByCount)])) {
    const left = a.baByCount[count] ?? noCount;
    const right = b.baByCount[count] ?? noCount;
    merged.baByCount[count] = {
      atBats: left.atBats + right.atBats,
      hits: left.hits + right.hits,
      average: NaN,
    };
  }
  finalizePitchingRates(merged);
  return merged;
}
