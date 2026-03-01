import { z } from 'zod';
import { GameLocationType } from '../types/game';

export const createGameSchema = z.object({
  opponentName: z.string().min(1, 'Opponent name is required').max(100),
  scheduledAt: z.string().datetime(),
  locationType: z.nativeEnum(GameLocationType),
  venueName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
