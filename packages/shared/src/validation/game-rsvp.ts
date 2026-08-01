import { z } from 'zod';
import { GAME_RSVP_STATUSES } from '../types/game-rsvp';

export const gameRsvpStatusSchema = z.enum(GAME_RSVP_STATUSES);

export const upsertGameRsvpSchema = z.object({
  gameId: z.string().uuid(),
  playerId: z.string().uuid(),
  status: gameRsvpStatusSchema,
  note: z.string().max(200).optional(),
});

export type UpsertGameRsvpInput = z.infer<typeof upsertGameRsvpSchema>;
