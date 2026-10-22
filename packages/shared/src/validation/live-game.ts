import { z } from 'zod';
import { GAME_STATUSES } from './game-detail';
import { historyEventSchema } from './game-corrections';

/**
 * The mobile live viewer's starting payload (`/api/m/v1/games/:gameId/live`),
 * the same data the web /live page renders. The app then follows new
 * `game_events` over Supabase Realtime, which the
 * `authorized_viewers_view_live_game_events` RLS policy opens to every viewer
 * this route admits.
 */

export const livePlayerSchema = z.object({
  lastName: z.string(),
  jerseyNumber: z.union([z.string(), z.number()]).nullable(),
});
export type LivePlayer = z.infer<typeof livePlayerSchema>;

export const liveGameResponseSchema = z.object({
  game: z.object({
    id: z.string(),
    teamId: z.string(),
    status: z.enum(GAME_STATUSES),
    opponentName: z.string().nullable(),
    scheduledAt: z.string(),
    timeZone: z.string().nullable(),
    venueName: z.string().nullable(),
    locationType: z.enum(['home', 'away', 'neutral']),
    neutralHomeTeam: z.enum(['us', 'opponent']).nullable(),
    homeScore: z.number(),
    awayScore: z.number(),
  }),
  teamName: z.string(),
  /** Every event of the game in sequence order; the client cuts at the last reset. */
  events: z.array(historyEventSchema),
  /** Player id → name and jersey, both teams. */
  players: z.record(livePlayerSchema),
});
export type LiveGameResponse = z.infer<typeof liveGameResponseSchema>;
