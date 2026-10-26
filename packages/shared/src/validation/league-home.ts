import { z } from 'zod';

/**
 * Contracts for the league home (the web /l/:slug page) and its team stat
 * page (/l/:slug/team/:teamId) as the phone shows them, from
 * `GET /api/m/v1/leagues/:slug/home` and `…/teams/:teamId`. The app is always
 * signed in, so it gets the signed-in view: full names, and opted-out players
 * as on the web for a signed-in viewer. Values arrive formatted for display
 * (`display`), with the number alongside where a table sorts by it.
 */

const slugSchema = z.string().trim().min(1, 'Missing league.').max(200);
const seasonSchema = z.string().trim().max(100).optional();

export const leagueHomeInputSchema = z.object({
  slug: slugSchema,
  season: seasonSchema,
  /** The viewer's active team, to mark its rows; ignored unless they're on it. */
  teamId: z.string().uuid().optional(),
});
export type LeagueHomeInput = z.input<typeof leagueHomeInputSchema>;

export const leagueTeamInputSchema = z.object({
  slug: slugSchema,
  teamId: z.string().uuid('Missing team.'),
  season: seasonSchema,
});
export type LeagueTeamInput = z.input<typeof leagueTeamInputSchema>;

const standingRowSchema = z.object({
  /** The platform team (null for a league opponent), whose stat page opens from it. */
  teamId: z.string().nullable(),
  name: z.string(),
  wins: z.number(),
  losses: z.number(),
  ties: z.number(),
  winPct: z.number(),
  runsFor: z.number(),
  runsAgainst: z.number(),
});
export type LeagueHomeStandingRow = z.infer<typeof standingRowSchema>;

const leaderRowSchema = z.object({
  id: z.string(),
  rank: z.number(),
  name: z.string(),
  /** The player's team; null on a team board. */
  teamName: z.string().nullable(),
  teamId: z.string().nullable(),
  display: z.string(),
  /** The viewer's own team (or its player). */
  ours: z.boolean(),
});
export type LeagueLeaderRow = z.infer<typeof leaderRowSchema>;

const leaderBoardSchema = z.object({ key: z.string(), label: z.string(), rows: z.array(leaderRowSchema) });
export type LeagueLeaderBoard = z.infer<typeof leaderBoardSchema>;

export const LEADER_TABS = ['batting', 'pitching', 'team', 'special'] as const;
export type LeaderTab = (typeof LEADER_TABS)[number];

export const LEAGUE_HOME_SECTIONS = ['hero', 'standings', 'spotlights', 'leaders', 'recent'] as const;

export const leagueHomeResponseSchema = z.object({
  slug: z.string(),
  league: z.object({ id: z.string(), name: z.string(), logoUrl: z.string().nullable() }),
  /** The sections the league shows, in its order (the web page's theme). */
  sections: z.array(z.enum(LEAGUE_HOME_SECTIONS)),
  season: z.string(),
  /** Every season with standings, newest first. */
  seasons: z.array(z.string()),
  counters: z.object({ teams: z.number(), games: z.number() }),
  /** When the standings and stats were last rebuilt. */
  updatedAt: z.string().nullable(),
  /** The whole league, best first. */
  standings: z.array(standingRowSchema),
  /** Per division, alphabetically; empty when the league has none. */
  divisions: z.array(z.object({ id: z.string(), name: z.string(), rows: z.array(standingRowSchema) })),
  /** League Leaders by tab; custom boards are under Special when the league shows them. */
  leaders: z.record(z.enum(LEADER_TABS), z.array(leaderBoardSchema)),
  spotlights: z.array(
    z.object({
      kind: z.enum(['player', 'team']),
      subjectName: z.string(),
      /** A hot team's own page. */
      subjectTeamId: z.string().nullable(),
      teamName: z.string().nullable(),
      teamId: z.string().nullable(),
      blurb: z.string(),
    }),
  ),
  recent: z.array(
    z.object({
      id: z.string(),
      teamName: z.string(),
      teamId: z.string(),
      opponent: z.string().nullable(),
      ourScore: z.number(),
      theirScore: z.number(),
      result: z.enum(['W', 'L', 'T']),
    }),
  ),
  upcoming: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type LeagueHomeResponse = z.infer<typeof leagueHomeResponseSchema>;

const playerTableSchema = z.object({
  /** Column order; `sortDir` is the column's best-first direction. */
  columns: z.array(z.object({ key: z.string(), label: z.string(), sortDir: z.enum(['asc', 'desc']) })),
  rows: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      /** Stats hidden for this viewer: every cell is "—" and the row sorts last. */
      optedOut: z.boolean(),
      /** Per column key: the number to sort by (null when hidden) and the text to show. */
      cells: z.record(z.string(), z.object({ value: z.number().nullable(), display: z.string() })),
    }),
  ),
});
export type LeagueTeamPlayerTable = z.infer<typeof playerTableSchema>;

export const leagueTeamResponseSchema = z.object({
  slug: z.string(),
  league: z.object({ id: z.string(), name: z.string() }),
  season: z.string(),
  team: z.object({ id: z.string(), name: z.string(), logoUrl: z.string().nullable() }),
  record: z.object({
    wins: z.number(),
    losses: z.number(),
    ties: z.number(),
    winPct: z.number(),
    runsFor: z.number(),
    runsAgainst: z.number(),
  }),
  /** Place among the league's teams by win percentage; null when unranked. */
  rank: z.object({ rank: z.number().nullable(), total: z.number() }),
  divisionName: z.string().nullable(),
  teamStats: z.array(z.object({ key: z.string(), label: z.string(), display: z.string() })),
  batting: playerTableSchema,
  /** Only players who pitched. */
  pitching: playerTableSchema,
});
export type LeagueTeamResponse = z.infer<typeof leagueTeamResponseSchema>;
