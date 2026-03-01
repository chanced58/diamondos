import { z } from 'zod';
import { PlayerPosition, BatsThrows } from '../types/player';

export const createPlayerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  jerseyNumber: z.number().int().min(0).max(99).optional(),
  primaryPosition: z.nativeEnum(PlayerPosition).optional(),
  bats: z.nativeEnum(BatsThrows).optional(),
  throws: z.nativeEnum(BatsThrows).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  graduationYear: z.number().int().min(2000).max(2100).optional(),
  email: z.string().email('Must be a valid email address').optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
});

export const updatePlayerSchema = createPlayerSchema.partial();

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
