import { z } from 'zod';

/**
 * Contract for `GET /api/m/v1/teams/:teamId/stats?season=` — the web Stats
 * page (`/compliance`) as the phone shows it: season pitching (with each
 * pitcher's latest rest requirement and rolling 7-day pitch count), hitting,
 * catcher innings and, on plans with opponent tracking, per-opponent stats.
 * The server derives every stat with the web page's loader; the app picks
 * columns and formats with `season-stat-columns`. Rates that can't be computed
 * (no at-bats, no outs) travel as null: JSON has no NaN.
 */

const count = z.number().int().nonnegative();
const rate = z.number().nullable();

export const STAT_TIERS = ['youth', 'high_school', 'college'] as const;

export const seasonStatsInputSchema = z.object({
  teamId: z.string().uuid('Invalid team.'),
  /** Omitted → the active season, else every scored game. */
  seasonId: z.string().uuid('Invalid season.').optional(),
});
export type SeasonStatsInput = z.infer<typeof seasonStatsInputSchema>;

export const seasonBattingRowSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  gamesAppeared: count,
  plateAppearances: count,
  atBats: count,
  runs: count,
  hits: count,
  doubles: count,
  triples: count,
  homeRuns: count,
  rbi: count,
  walks: count,
  strikeouts: count,
  hitByPitch: count,
  sacrificeFlies: count,
  sacrificeHits: count,
  avg: rate,
  obp: rate,
  slg: rate,
  ops: rate,
  iso: rate,
  babip: rate,
  kPct: rate,
  bbPct: rate,
  woba: rate,
  battedBalls: count,
  hardHitBalls: count,
  hardHitPct: rate,
  qab: count,
  qabPct: rate,
});
export type SeasonBattingRow = z.infer<typeof seasonBattingRowSchema>;

export const countStatSchema = z.object({
  atBats: count,
  hits: count,
  average: rate,
});

export const seasonPitchingRowSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  gamesAppeared: count,
  inningsPitchedOuts: count,
  totalPitches: count,
  strikes: count,
  balls: count,
  strikePercentage: rate,
  firstPitchStrikes: count,
  firstPitchStrikePercentage: rate,
  threeBallCountPAs: count,
  threeZeroCountPAs: count,
  totalPAs: count,
  threeBallCountPercentage: rate,
  threeZeroCountPercentage: rate,
  hitsAllowed: count,
  runsAllowed: count,
  earnedRunsAllowed: count,
  walksAllowed: count,
  strikeouts: count,
  hitBatters: count,
  wildPitches: count,
  era: rate,
  whip: rate,
  strikeoutsPerSeven: rate,
  walksPerSeven: rate,
  /** Batting average against by "balls-strikes" count, e.g. "1-2". */
  baByCount: z.record(z.string(), countStatSchema),
});
export type SeasonPitchingRow = z.infer<typeof seasonPitchingRowSchema>;

/** A pitcher's latest `pitch_counts` row plus their rolling 7-day total. */
export const pitcherComplianceSchema = z.object({
  pitchCount: count,
  requiredRestDays: z.number().int().nullable(),
  canPitchNextDay: z.boolean().nullable(),
  /** YYYY-MM-DD */
  lastGameDate: z.string().nullable(),
  pitches7d: z.number().int().nullable(),
});
export type PitcherCompliance = z.infer<typeof pitcherComplianceSchema>;

export const seasonPitcherSchema = seasonPitchingRowSchema.extend({
  compliance: pitcherComplianceSchema.nullable(),
});
export type SeasonPitcher = z.infer<typeof seasonPitcherSchema>;

export const catcherInningsRowSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  totalInnings: z.number().nonnegative(),
  games: count,
  lastGameDate: z.string().nullable(),
});
export type CatcherInningsRow = z.infer<typeof catcherInningsRowSchema>;

export const opponentBattingRowSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  pa: count,
  ab: count,
  r: count,
  h: count,
  doubles: count,
  triples: count,
  hr: count,
  rbi: count,
  bb: count,
  k: count,
  hbp: count,
  sf: count,
  sh: count,
  sb: count,
  cs: count,
  avg: rate,
  obp: rate,
  slg: rate,
  ops: rate,
});
export type OpponentBattingRow = z.infer<typeof opponentBattingRowSchema>;

export const opponentTeamStatsSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  gamesPlayed: count,
  wins: count,
  losses: count,
  ties: count,
  batting: z.array(opponentBattingRowSchema),
  pitching: z.array(seasonPitchingRowSchema),
});
export type OpponentTeamStatsRow = z.infer<typeof opponentTeamStatsSchema>;

export const seasonStatsResponseSchema = z.object({
  teamId: z.string(),
  seasons: z.array(z.object({ id: z.string(), name: z.string(), isActive: z.boolean() })),
  /** Null → every completed and in-progress game. */
  season: z.object({ id: z.string(), name: z.string() }).nullable(),
  gameCount: count,
  /** From the team's level; the viewer may switch tiers. */
  defaultTier: z.enum(STAT_TIERS),
  /** Plan features that unlock advanced columns and the Opponents tab. */
  features: z.object({
    advancedBatting: z.boolean(),
    advancedPitching: z.boolean(),
    opponents: z.boolean(),
  }),
  /** The team is in a league (League Stats). */
  hasLeague: z.boolean(),
  pitching: z.array(seasonPitcherSchema),
  batting: z.array(seasonBattingRowSchema),
  catcher: z.array(catcherInningsRowSchema),
  /** Null when the plan doesn't include opponent tracking. */
  opponents: z.array(opponentTeamStatsSchema).nullable(),
  /** Active players without a current liability waiver. */
  missingWaiverCount: count,
});
export type SeasonStatsResponse = z.infer<typeof seasonStatsResponseSchema>;
