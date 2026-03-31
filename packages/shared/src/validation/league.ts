import { z } from 'zod';

export const createLeagueSchema = z.object({
  name: z.string().min(1, 'League name is required').max(100),
  description: z.string().max(500).optional(),
  stateCode: z
    .string()
    .length(2, 'State code must be exactly 2 letters')
    .regex(/^[A-Za-z]{2}$/, 'State code must be letters only')
    .toUpperCase()
    .optional(),
});

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
