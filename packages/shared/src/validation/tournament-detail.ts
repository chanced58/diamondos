import { z } from 'zod';
import { STAT_TIERS, seasonBattingRowSchema, seasonPitchingRowSchema } from './season-stats';

/**
 * Contract for `GET /api/m/v1/tournaments/:id` — the web tournament page as
 * the phone shows it: the tournament, its team, the lineup rules, its games
 * and the team's batting and pitching lines from scored tournament games.
 * The list and create go straight to Supabase (RLS and the
 * `create_tournament` RPC), as the web does.
 */

export const tournamentDetailInputSchema = z.object({ tournamentId: z.string().uuid('Invalid tournament.') });
export type TournamentDetailInput = z.input<typeof tournamentDetailInputSchema>;

export const tournamentDetailResponseSchema = z.object({
  tournament: z.object({
    id: z.string(),
    name: z.string(),
    /** `YYYY-MM-DD`, the tournament's own calendar days. */
    startDate: z.string(),
    endDate: z.string(),
    status: z.string(),
  }),
  team: z.object({ id: z.string(), name: z.string() }),
  lineupRules: z.object({
    allowExpanded: z.boolean(),
    maxBatters: z.number(),
    allowMidGameExtension: z.boolean(),
    allowMidGameContraction: z.boolean(),
  }),
  games: z.array(
    z.object({
      id: z.string(),
      opponentName: z.string().nullable(),
      scheduledAt: z.string(),
      timeZone: z.string().nullable(),
      status: z.string(),
    }),
  ),
  /** Completed and in-progress tournament games the stats come from. */
  scoredGameCount: z.number(),
  batting: z.array(seasonBattingRowSchema),
  pitching: z.array(seasonPitchingRowSchema),
  /** From the team's level, as on the web page. */
  defaultTier: z.enum(STAT_TIERS),
  /** Plan features that unlock advanced columns. */
  features: z.object({ advancedBatting: z.boolean(), advancedPitching: z.boolean() }),
  /** A coach of the tournament team may add games. */
  canAddGame: z.boolean(),
});
export type TournamentDetailResponse = z.infer<typeof tournamentDetailResponseSchema>;
