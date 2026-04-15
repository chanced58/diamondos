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

// ── League Setup Wizard ─────────────────────────────────────────────────────

export const LEAGUE_TYPES = [
  { value: 'recreational', label: 'Recreational' },
  { value: 'travel', label: 'Travel / Select' },
  { value: 'high_school', label: 'High School (NFHS)' },
  { value: 'college', label: 'College (NCAA)' },
  { value: 'adult', label: 'Adult / Semi-Pro' },
  { value: 'tournament', label: 'Tournament' },
] as const;

export const LEAGUE_LEVELS = [
  { value: 'youth', label: 'Youth' },
  { value: 'middle_school', label: 'Middle School' },
  { value: 'high_school', label: 'High School' },
  { value: 'college', label: 'College' },
  { value: 'pro', label: 'Pro' },
] as const;

export const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'] as const;

export const leagueSetupStep1Schema = z.object({
  name: z.string().min(1, 'League name is required').max(100),
  leagueType: z.enum(['recreational', 'travel', 'high_school', 'college', 'adult', 'tournament'], {
    required_error: 'League type is required',
  }),
  level: z.enum(['youth', 'middle_school', 'high_school', 'college', 'pro'], {
    required_error: 'Competitive level is required',
  }),
  stateCode: z
    .string()
    .length(2, 'State code must be exactly 2 letters')
    .regex(/^[A-Za-z]{2}$/, 'State code must be letters only')
    .toUpperCase()
    .optional()
    .or(z.literal('')),
  seasonName: z.enum(['Spring', 'Summer', 'Fall', 'Winter'], {
    required_error: 'Season is required',
  }),
  seasonYear: z.number().int().min(2020).max(2050),
  teamCount: z.number().int().min(2, 'At least 2 teams required').max(64, 'Maximum 64 teams'),
});

export type LeagueSetupStep1 = z.infer<typeof leagueSetupStep1Schema>;

export const leagueSetupStep2Schema = z.object({
  teamNames: z.array(z.string().min(1, 'Team name is required').max(100)).min(2),
  divisions: z.array(z.string().min(1, 'Division name is required').max(100)).optional(),
  teamDivisions: z.record(z.string(), z.string()).optional(),
});

export type LeagueSetupStep2 = z.infer<typeof leagueSetupStep2Schema>;
