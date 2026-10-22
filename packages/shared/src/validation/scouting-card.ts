import { z } from 'zod';
import { AiScoutingCardSchema } from '../ai/scouting-card-schema';
import { opponentTeamSummarySchema } from './opponent-team';

/**
 * Contract for an opponent's AI scouting card
 * (`/api/m/v1/opponent-teams/:opponentTeamId/scouting-card`): GET reads the
 * latest card, POST generates a new one from our past games against them.
 * Coaches of the team that owns the opponent. Mirrors `PersistedScoutingCard`.
 */

export const scoutingCardInputSchema = z.object({
  opponentTeamId: z.string().uuid('Missing opponent team.'),
});
export type ScoutingCardRequest = z.input<typeof scoutingCardInputSchema>;

export const scoutingHitterStatsSchema = z.object({
  opponentPlayerId: z.string(),
  displayName: z.string(),
  position: z.string().optional(),
  bats: z.string().optional(),
  pa: z.number(),
  ab: z.number(),
  h: z.number(),
  hr: z.number(),
  k: z.number(),
  bb: z.number(),
  /** Formatted rates, e.g. ".333". */
  avg: z.string(),
  obp: z.string(),
  slg: z.string(),
  ops: z.string(),
});

export const scoutingPitcherStatsSchema = z.object({
  opponentPlayerId: z.string().nullable(),
  displayName: z.string(),
  pitches: z.number(),
  pitchMix: z.array(z.object({ pitchType: z.string(), count: z.number(), percent: z.number() })),
  avgVelocity: z.number().nullable(),
  firstPitchStrikePct: z.number().nullable(),
});

export const persistedScoutingCardSchema = z.object({
  id: z.string(),
  opponentTeamId: z.string(),
  teamId: z.string(),
  aiCard: AiScoutingCardSchema,
  hitterStats: z.array(scoutingHitterStatsSchema),
  pitcherStats: z.array(scoutingPitcherStatsSchema),
  gameSampleCount: z.number(),
  model: z.string(),
  generatedBy: z.string().optional(),
  generatedAt: z.string(),
});

export const scoutingCardResponseSchema = z.object({
  opponentTeam: opponentTeamSummarySchema,
  /** Games we've played against them; a card needs at least one. */
  priorGames: z.number().int().nonnegative(),
  /** The latest card; null before the first is generated. */
  card: persistedScoutingCardSchema.nullable(),
});
export type ScoutingCardResponse = z.infer<typeof scoutingCardResponseSchema>;

export const generatedScoutingCardResponseSchema = z.object({ card: persistedScoutingCardSchema });
export type GeneratedScoutingCardResponse = z.infer<typeof generatedScoutingCardResponseSchema>;
