import { z } from 'zod';
import type { LeagueScoringSettings } from '../types/league-scoring-settings';
import { defaultLeagueScoringSettings, MAX_BATTERS_CAP } from './league-scoring-settings';

const newTeamSchema = z.object({
  type: z.literal('new'),
  name: z.string().trim().min(1, 'Team name is required').max(100),
  organization: z.string().trim().max(100).optional(),
  stateCode: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
}).strict();

const existingTeamSchema = z.object({
  type: z.literal('existing'),
  teamId: z.string().uuid(),
}).strict();

const dateSchema = z.string().date();

export const createTournamentSchema = z.object({
  name: z.string().trim().min(1, 'Tournament name is required').max(100),
  startDate: dateSchema,
  endDate: dateSchema,
  requestId: z.string().uuid(),
  team: z.discriminatedUnion('type', [existingTeamSchema, newTeamSchema]),
  lineup: z.object({
    allowExpanded: z.boolean(),
    maxBatters: z.number().int().min(10).max(MAX_BATTERS_CAP).optional(),
    allowMidGameChanges: z.boolean(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.endDate < value.startDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after the start date.' });
  }
  if (value.lineup.allowExpanded && value.lineup.maxBatters === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lineup', 'maxBatters'], message: 'Choose a maximum lineup size from 10 to 30.' });
  }
  if (!value.lineup.allowExpanded && value.lineup.maxBatters !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lineup', 'maxBatters'], message: 'A lineup cap is only used when expanded lineups are enabled.' });
  }
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

export function createTournamentScoringSettings(lineup: CreateTournamentInput['lineup']): LeagueScoringSettings {
  const settings = defaultLeagueScoringSettings();
  return {
    ...settings,
    lineup: {
      ...settings.lineup,
      allowExpanded: lineup.allowExpanded,
      maxBatters: lineup.allowExpanded ? lineup.maxBatters ?? MAX_BATTERS_CAP : 9,
      allowMidGameExtension: lineup.allowMidGameChanges,
      allowMidGameContraction: lineup.allowMidGameChanges,
    },
  };
}
