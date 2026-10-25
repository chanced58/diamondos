import { z } from 'zod';

/**
 * The team dashboard (the web /dashboard page and the mobile Home tab,
 * `GET /api/m/v1/teams/:teamId/dashboard[?view=league]`): live games, the next
 * game, the next four weeks, recent results and the latest announcements. The
 * league view widens games to every team in the team's league; practices,
 * events and announcements stay the team's own.
 */

export const dashboardViewSchema = z.enum(['team', 'league']);
export type DashboardView = z.infer<typeof dashboardViewSchema>;

export const dashboardInputSchema = z.object({
  teamId: z.string().uuid('Missing team.'),
  /** Anything but `league` is the team view, as on the web. */
  view: z
    .string()
    .nullish()
    .transform((value): DashboardView => (value === 'league' ? 'league' : 'team')),
});
export type DashboardInput = z.input<typeof dashboardInputSchema>;

const liveGameSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  /** The game's team: ours, or another league team's in the league view. */
  teamName: z.string(),
  opponentName: z.string().nullable(),
  isHome: z.boolean(),
  /** Replayed from the event log, as the web live card does. */
  ourScore: z.number(),
  theirScore: z.number(),
  inning: z.number(),
  isTopOfInning: z.boolean(),
  outs: z.number(),
});
export type DashboardLiveGame = z.infer<typeof liveGameSchema>;

const nextGameSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  opponentName: z.string().nullable(),
  isHome: z.boolean(),
  scheduledAt: z.string(),
  timeZone: z.string().nullable(),
  venueName: z.string().nullable(),
});
export type DashboardNextGame = z.infer<typeof nextGameSchema>;

const upcomingItemSchema = z.object({
  kind: z.enum(['game', 'practice', 'event']),
  id: z.string(),
  date: z.string(),
  /** A game's zone; null for practices, events and games without one (the viewer's zone). */
  timeZone: z.string().nullable(),
  label: z.string(),
  sublabel: z.string().nullable(),
});
export type DashboardUpcomingItem = z.infer<typeof upcomingItemSchema>;

const recentGameSchema = z.object({
  id: z.string(),
  date: z.string(),
  timeZone: z.string().nullable(),
  /** Prefixed with the team's name for another team's game in the league view. */
  opponent: z.string().nullable(),
  isHome: z.boolean(),
  ourScore: z.number(),
  theirScore: z.number(),
});
export type DashboardRecentGame = z.infer<typeof recentGameSchema>;

const announcementSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  senderName: z.string(),
  channelName: z.string().nullable(),
});
export type DashboardAnnouncement = z.infer<typeof announcementSchema>;

export const dashboardResponseSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  /** The team's league, when it is in one; the league view needs one. */
  league: z.object({ id: z.string(), name: z.string() }).nullable(),
  view: dashboardViewSchema,
  liveGames: z.array(liveGameSchema),
  nextGame: nextGameSchema.nullable(),
  upcoming: z.array(upcomingItemSchema),
  /** The last 8 completed games, newest first. */
  recentGames: z.array(recentGameSchema),
  record: z.object({ wins: z.number(), losses: z.number(), runsFor: z.number(), runsAgainst: z.number() }),
  announcements: z.array(announcementSchema),
  /** The team's announcement channel a coach posts in, or null when the viewer can't post. */
  announcementChannelId: z.string().nullable(),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
