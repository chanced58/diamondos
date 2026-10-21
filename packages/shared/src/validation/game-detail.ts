import { z } from 'zod';

/**
 * Contracts for the mobile game-detail API (`/api/m/v1/games/:gameId…`).
 *
 * Request schemas are shared by the web server actions and the mobile routes
 * through the services in `apps/web/src/lib/services/games/`. The response
 * schema is parsed by the mobile app, so a drifting web deploy fails at the
 * boundary instead of rendering half a screen. Unknown keys are stripped.
 */

export const gameIdInputSchema = z.object({
  gameId: z.string().uuid('Missing game ID.'),
});
export type GameIdInput = z.input<typeof gameIdInputSchema>;

export const cancelGameInputSchema = gameIdInputSchema.extend({
  /** Post the cancellation to the team's announcement channel. */
  notifyTeam: z.boolean().default(false),
});
export type CancelGameInput = z.input<typeof cancelGameInputSchema>;

export const resolveReconciliationConflictInputSchema = z.object({
  reconciliationId: z.string().uuid('Missing reconciliation ID.'),
  conflictKey: z.string().trim().min(1, 'Missing conflict.'),
  /** true = accept the away scorekeeper's value; false = revert to home. */
  useAwayValue: z.boolean(),
});
export type ResolveReconciliationConflictInput = z.input<typeof resolveReconciliationConflictInputSchema>;

export const GAME_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'postponed'] as const;

export const gameDetailGameSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  status: z.enum(GAME_STATUSES),
  /** Null or blank means TBD. */
  opponentName: z.string().nullable(),
  opponentTeamId: z.string().nullable(),
  scheduledAt: z.string(),
  /** IANA zone the start time was entered in; null = unknown (use the device zone). */
  timeZone: z.string().nullable(),
  locationType: z.enum(['home', 'away', 'neutral']),
  neutralHomeTeam: z.enum(['us', 'opponent']).nullable(),
  venueName: z.string().nullable(),
  notes: z.string().nullable(),
  homeScore: z.number(),
  awayScore: z.number(),
  currentInning: z.number().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  tournamentId: z.string().nullable(),
});

export const gameTakeawaySchema = z.object({
  code: z.string(),
  label: z.string(),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  metric: z.string(),
});

export const gameReconciliationConflictSchema = z.object({
  /** Stable identity — what the override endpoint takes. */
  key: z.string(),
  label: z.string(),
  homeLog: z.number().nullable(),
  awayLog: z.number().nullable(),
  /** The away value has been accepted in place of the home value. */
  overridden: z.boolean(),
});

export const gameDetailResponseSchema = z.object({
  game: gameDetailGameSchema,
  viewer: z.object({
    /** Coaching staff (or platform admin): may run every coach action. */
    isCoach: z.boolean(),
  }),
  hasLineup: z.boolean(),
  hasOpponentLineup: z.boolean(),
  /** Coach-only weakness takeaways for a completed game; null otherwise. */
  takeaways: z
    .object({
      lostGame: z.boolean(),
      /** Detection failed — show a "temporarily unavailable" note. */
      unavailable: z.boolean(),
      items: z.array(gameTakeawaySchema),
    })
    .nullable(),
  /** Dual-scorekeeper reconciliation for a completed paired game; null otherwise. */
  reconciliation: z
    .object({
      reconciliationId: z.string(),
      homeTeamLabel: z.string(),
      awayTeamLabel: z.string(),
      /** The viewer is the home (canonical) team's coach. */
      canOverride: z.boolean(),
      conflicts: z.array(gameReconciliationConflictSchema),
    })
    .nullable(),
});

export type GameDetailGame = z.infer<typeof gameDetailGameSchema>;
export type GameTakeaway = z.infer<typeof gameTakeawaySchema>;
export type GameReconciliationConflict = z.infer<typeof gameReconciliationConflictSchema>;
export type GameDetailResponse = z.infer<typeof gameDetailResponseSchema>;
