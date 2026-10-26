import { z } from 'zod';

/**
 * Contract for the team's league page (the web /league page and the mobile
 * More › League screen, `GET /api/m/v1/teams/:teamId/league`): the league,
 * its counters, standings by division from completed games (platform teams
 * and league opponent teams), and its staff.
 */

export const leaguePageInputSchema = z.object({ teamId: z.string().uuid('Missing team.') });
export type LeaguePageInput = z.input<typeof leaguePageInputSchema>;

export const GAME_RESULTS = ['W', 'L', 'T'] as const;
const gameResultSchema = z.enum(GAME_RESULTS);
export type StandingsGameResult = z.infer<typeof gameResultSchema>;

export const standingsTeamRowSchema = z.object({
  /** The platform team's id, or the opponent team's for a league opponent. */
  key: z.string(),
  name: z.string(),
  organization: z.string().nullable(),
  /** The platform team (null for an opponent-only team). */
  teamId: z.string().nullable(),
  /** The viewer's own team. */
  isActive: z.boolean(),
  isOpponent: z.boolean(),
  wins: z.number(),
  losses: z.number(),
  ties: z.number(),
  /** Wins over games played; 0 before any game. */
  pct: z.number(),
  rf: z.number(),
  ra: z.number(),
  diff: z.number(),
  gamesPlayed: z.number(),
  /** The last five results, oldest first. */
  last5: z.array(gameResultSchema),
  streak: z.object({ type: gameResultSchema, count: z.number() }).nullable(),
});
export type StandingsTeamRow = z.infer<typeof standingsTeamRowSchema>;

export const standingsDivisionSchema = z.object({
  id: z.string(),
  name: z.string(),
  teams: z.array(standingsTeamRowSchema),
});
export type StandingsDivision = z.infer<typeof standingsDivisionSchema>;

export const leaguePageResponseSchema = z.object({
  league: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    /** The public league home's slug, when it has one. */
    slug: z.string().nullable(),
  }),
  counters: z.object({
    teams: z.number(),
    divisions: z.number(),
    gamesPlayed: z.number(),
    /** The team's overall place by win percentage, or null when it isn't ranked. */
    yourRank: z.number().nullable(),
  }),
  divisions: z.array(standingsDivisionSchema),
  staff: z.array(z.object({ id: z.string(), name: z.string(), role: z.enum(['league_admin', 'league_manager']) })),
  /** League admins manage the league (on the web). */
  isLeagueAdmin: z.boolean(),
  /** The league's color scheme, for the web page's accents. */
  colorScheme: z.string(),
});
export type LeaguePageResponse = z.infer<typeof leaguePageResponseSchema>;
