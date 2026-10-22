import { z } from 'zod';
import { seasonBattingRowSchema, seasonPitchingRowSchema } from './season-stats';

/**
 * Contracts for the league pages a team member reaches from the Stats tab:
 * `GET /api/m/v1/teams/:teamId/league-stats` (the web League Stats page —
 * every league player's batting and pitching) and
 * `GET /api/m/v1/teams/:teamId/league-comparison` (the web Team Comparison
 * page). The league is the team's active league.
 */

const count = z.number().int().nonnegative();

export const leagueStatsInputSchema = z.object({
  teamId: z.string().uuid('Invalid team.'),
});
export type LeagueStatsInput = z.infer<typeof leagueStatsInputSchema>;

const leagueSchema = z.object({ id: z.string(), name: z.string() });

export const leagueStatsResponseSchema = z.object({
  teamId: z.string(),
  league: leagueSchema,
  /** DiamondOS teams in the league. */
  teamCount: count,
  /** Their completed and in-progress games. */
  gameCount: count,
  /** Every league player; names read "First Last (Team)". */
  pitching: z.array(seasonPitchingRowSchema),
  batting: z.array(seasonBattingRowSchema),
});
export type LeagueStatsResponse = z.infer<typeof leagueStatsResponseSchema>;

export const teamComparisonRowSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  /** A league opponent team, seen from the games DiamondOS teams played against it. */
  isOpponentTeam: z.boolean(),
  gamesPlayed: count,
  wins: count,
  losses: count,
  ties: count,
  runsScored: count,
  runsAllowed: count,
  /** H / AB; 0 with no at-bats. */
  teamAvg: z.number(),
  /** Earned runs per 7 innings; 0 with no outs. */
  teamEra: z.number(),
  totalHits: count,
  totalStrikeouts: count,
});
export type TeamComparisonRowWire = z.infer<typeof teamComparisonRowSchema>;

export const leagueComparisonResponseSchema = z.object({
  teamId: z.string(),
  league: leagueSchema,
  /** Best winning percentage first. */
  rows: z.array(teamComparisonRowSchema),
});
export type LeagueComparisonResponse = z.infer<typeof leagueComparisonResponseSchema>;
