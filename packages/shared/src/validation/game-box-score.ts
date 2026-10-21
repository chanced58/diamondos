import { z } from 'zod';

/**
 * Contract for `GET /api/m/v1/games/:gameId/box-score` — the game stats page
 * as the phone shows it. The server derives every stat (the same loader as the
 * web stats page and the Home Team export) and resolves "us" and "them", so
 * the app only formats numbers. Rates that can't be computed (no at-bats, no
 * outs) travel as null: JSON has no NaN.
 */

const count = z.number().int().nonnegative();
const rate = z.number().nullable();

export const boxScoreBatterSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  ab: count,
  r: count,
  h: count,
  doubles: count,
  triples: count,
  hr: count,
  rbi: count,
  bb: count,
  k: count,
  sb: count,
  avg: rate,
});

export const boxScorePitcherSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  battersFaced: count,
  inningsPitchedOuts: count,
  h: count,
  r: count,
  er: count,
  bb: count,
  k: count,
  hbp: count,
  wp: count,
  pitches: count,
  /** 0–1 */
  strikePct: rate,
  /** At-bats that started with three straight balls. */
  threeZeroCounts: count,
  era: rate,
});

export const boxScoreFielderSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  position: z.string(),
  po: count,
  a: count,
  e: count,
});

const sideSchema = z.object({
  name: z.string(),
  runsByInning: z.array(count),
  r: count,
  h: count,
  e: count,
  batting: z.array(boxScoreBatterSchema),
  pitching: z.array(boxScorePitcherSchema),
  fielding: z.array(boxScoreFielderSchema),
});

export const gameBoxScoreResponseSchema = z.object({
  gameId: z.string(),
  status: z.enum(['in_progress', 'completed']),
  /** Our team batted last (home, or the home side at a neutral site). */
  weAreHome: z.boolean(),
  us: sideSchema,
  them: sideSchema,
  /** Coaches may download the Home Team (GameChanger) export. */
  canExport: z.boolean(),
});

export type BoxScoreBatter = z.infer<typeof boxScoreBatterSchema>;
export type BoxScorePitcher = z.infer<typeof boxScorePitcherSchema>;
export type BoxScoreFielder = z.infer<typeof boxScoreFielderSchema>;
export type GameBoxScoreSide = z.infer<typeof sideSchema>;
export type GameBoxScoreResponse = z.infer<typeof gameBoxScoreResponseSchema>;
