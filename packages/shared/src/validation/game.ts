import { z } from 'zod';
import { GameLocationType } from '../types/game';

export const createGameSchema = z.object({
  // null = TBD opponent (playoff brackets where the opponent isn't decided yet).
  opponentName: z.string().min(1).max(100).nullable(),
  scheduledAt: z.string().datetime(),
  locationType: z.nativeEnum(GameLocationType),
  venueName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
