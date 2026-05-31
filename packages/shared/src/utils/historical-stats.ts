/**
 * Convert imported historical box-score counting stats into the same
 * BattingStats / PitchingStats / FieldingStats shapes the live event-sourced
 * derivers produce, so the stats UI can render imported and live rows
 * uniformly.
 *
 * The rate formulas below mirror those in batting-stats.ts / pitching-stats.ts
 * / fielding-stats.ts EXACTLY. Imported data only provides counting stats, so
 * stat fields that require pitch-level or batted-ball detail (QAB, hard-hit,
 * first-pitch strikes, BA-by-count, …) are left at 0 / NaN and render "---".
 */
import type { BattingStats } from '../types/batting';
import type { PitchingStats, CountStat } from '../types/pitching';
import type { FieldingStats } from '../types/fielding';
import type {
  BattingCounts,
  PitchingCounts,
  FieldingCounts,
} from '../integrations/historical/types';

// FanGraphs 2023 linear weights — kept in sync with batting-stats.ts.
const W_BB = 0.69;
const W_HBP = 0.72;
const W_1B = 0.89;
const W_2B = 1.27;
const W_3B = 1.62;
const W_HR = 2.1;

/** Innings as a decimal from outs recorded (matches pitching-stats.ts). */
function inningsPitched(outs: number): number {
  return outs / 3;
}

function sumKey<T>(rows: T[], key: keyof T): number {
  let total = 0;
  for (const row of rows) total += Number((row[key] as number | undefined) ?? 0);
  return total;
}

/** Aggregate per-game BattingCounts into a single BattingStats line. */
export function battingStatsFromCounts(
  playerId: string,
  playerName: string,
  gamesAppeared: number,
  rows: BattingCounts[],
): BattingStats {
  const plateAppearances = sumKey(rows, 'pa');
  const atBats = sumKey(rows, 'ab');
  const runs = sumKey(rows, 'r');
  const hits = sumKey(rows, 'h');
  const doubles = sumKey(rows, '2b');
  const triples = sumKey(rows, '3b');
  const homeRuns = sumKey(rows, 'hr');
  const rbi = sumKey(rows, 'rbi');
  const walks = sumKey(rows, 'bb');
  const strikeouts = sumKey(rows, 'so');
  const hitByPitch = sumKey(rows, 'hbp');
  const sacrificeFlies = sumKey(rows, 'sf');
  const sacrificeHits = sumKey(rows, 'sh');

  const singles = hits - doubles - triples - homeRuns;
  const totalBases = singles + 2 * doubles + 3 * triples + 4 * homeRuns;

  const avg = atBats > 0 ? hits / atBats : NaN;
  const slg = atBats > 0 ? totalBases / atBats : NaN;
  const obpDenom = atBats + walks + hitByPitch + sacrificeFlies;
  const obp = obpDenom > 0 ? (hits + walks + hitByPitch) / obpDenom : NaN;
  const ops = isNaN(obp) || isNaN(slg) ? NaN : obp + slg;
  const iso = isNaN(slg) || isNaN(avg) ? NaN : slg - avg;
  const babipDenom = atBats - strikeouts - homeRuns + sacrificeFlies;
  const babip = babipDenom > 0 ? (hits - homeRuns) / babipDenom : NaN;
  const kPct = plateAppearances > 0 ? strikeouts / plateAppearances : NaN;
  const bbPct = plateAppearances > 0 ? walks / plateAppearances : NaN;
  const wobaDenom = atBats + walks + sacrificeFlies + hitByPitch;
  const woba =
    wobaDenom > 0
      ? (W_BB * walks +
          W_HBP * hitByPitch +
          W_1B * singles +
          W_2B * doubles +
          W_3B * triples +
          W_HR * homeRuns) /
        wobaDenom
      : NaN;

  return {
    playerId,
    playerName,
    gamesAppeared,
    plateAppearances,
    atBats,
    runs,
    hits,
    doubles,
    triples,
    homeRuns,
    rbi,
    walks,
    strikeouts,
    hitByPitch,
    sacrificeFlies,
    sacrificeHits,
    avg,
    obp,
    slg,
    ops,
    iso,
    babip,
    kPct,
    bbPct,
    woba,
    // Not derivable from box-score counts — render "---".
    battedBalls: 0,
    hardHitBalls: 0,
    hardHitPct: NaN,
    qab: 0,
    qabPct: NaN,
  };
}

const EMPTY_BA_BY_COUNT: Record<string, CountStat> = {};

/** Aggregate per-game PitchingCounts into a single PitchingStats line. */
export function pitchingStatsFromCounts(
  playerId: string,
  playerName: string,
  gamesAppeared: number,
  rows: PitchingCounts[],
): PitchingStats {
  const inningsPitchedOuts = sumKey(rows, 'ipOuts');
  const totalPitches = sumKey(rows, 'pitches');
  const strikes = sumKey(rows, 'strikes');
  const balls = sumKey(rows, 'balls');
  const hitsAllowed = sumKey(rows, 'h');
  const runsAllowed = sumKey(rows, 'r');
  const earnedRunsAllowed = sumKey(rows, 'er');
  const walksAllowed = sumKey(rows, 'bb');
  const strikeouts = sumKey(rows, 'so');
  const hitBatters = sumKey(rows, 'hbp');
  const wildPitches = sumKey(rows, 'wp');

  const ip = inningsPitched(inningsPitchedOuts);
  const strikePercentage = totalPitches > 0 ? strikes / totalPitches : 0;

  let era: number;
  let whip: number;
  let strikeoutsPerSeven: number;
  let walksPerSeven: number;
  if (ip > 0) {
    era = (earnedRunsAllowed * 7) / ip;
    whip = (walksAllowed + hitsAllowed) / ip;
    strikeoutsPerSeven = (strikeouts * 7) / ip;
    walksPerSeven = (walksAllowed * 7) / ip;
  } else {
    era = Infinity;
    whip = Infinity;
    strikeoutsPerSeven = 0;
    walksPerSeven = 0;
  }

  return {
    playerId,
    playerName,
    gamesAppeared,
    inningsPitchedOuts,
    totalPitches,
    strikes,
    balls,
    strikePercentage,
    hitsAllowed,
    runsAllowed,
    earnedRunsAllowed,
    walksAllowed,
    strikeouts,
    hitBatters,
    wildPitches,
    era,
    whip,
    strikeoutsPerSeven,
    walksPerSeven,
    // Not derivable from box-score counts — render "---".
    firstPitchStrikes: 0,
    firstPitchStrikePercentage: 0,
    threeBallCountPAs: 0,
    threeZeroCountPAs: 0,
    totalPAs: 0,
    threeBallCountPercentage: 0,
    threeZeroCountPercentage: 0,
    baByCount: EMPTY_BA_BY_COUNT,
  };
}

/** Aggregate per-game FieldingCounts into a single FieldingStats line. */
export function fieldingStatsFromCounts(
  playerId: string,
  playerName: string,
  gamesAppeared: number,
  rows: FieldingCounts[],
): FieldingStats {
  const putouts = sumKey(rows, 'po');
  const assists = sumKey(rows, 'a');
  const errors = sumKey(rows, 'e');
  const denom = putouts + assists + errors;
  return {
    playerId,
    playerName,
    gamesAppeared,
    putouts,
    assists,
    errors,
    fieldingPct: denom > 0 ? (putouts + assists) / denom : NaN,
  };
}
