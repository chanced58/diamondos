import { z } from 'zod';
import { UserRole } from '../types/user';

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100),
  organization: z.string().max(100).optional(),
  stateCode: z.string().length(2).toUpperCase().optional(),
});

export const createSeasonSchema = z.object({
  name: z.string().min(1, 'Season name is required').max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.nativeEnum(UserRole),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
