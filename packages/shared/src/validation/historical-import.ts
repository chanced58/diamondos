import { z } from 'zod';

/**
 * Validation for the league historical-data import flow. Raw rows arrive as
 * loose strings (validated leniently at the parse boundary); the action inputs
 * below are the strict contracts the server actions enforce before touching the
 * database.
 */

export const historicalImportPlatformSchema = z.enum(['home_team']);
export const historicalCategorySchema = z.enum(['rosters', 'player_stats', 'team_stats']);

/** Phase A: which league + platform is being imported (the file rides in FormData). */
export const analyzeImportInputSchema = z.object({
  leagueId: z.string().uuid(),
  sourcePlatform: historicalImportPlatformSchema,
});
export type AnalyzeImportInput = z.infer<typeof analyzeImportInputSchema>;

/** A single player reconciliation decision from the admin. */
export const reconcileDecisionSchema = z
  .object({
    action: z.enum(['match', 'create', 'skip']),
    externalPlayerId: z.string().nullable().optional(),
    // For action='match':
    playerId: z.string().uuid().optional(),
    // For action='create':
    firstName: z.string().max(50).optional(),
    lastName: z.string().max(50).optional(),
    jerseyNumber: z.number().int().min(0).max(99).nullable().optional(),
    primaryPosition: z.string().optional(),
    bats: z.string().optional(),
    throws: z.string().optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    graduationYear: z.number().int().min(1900).max(2100).nullable().optional(),
    teamId: z.string().uuid().nullable().optional(),
    confidence: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'match' && !val.playerId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'playerId required for match', path: ['playerId'] });
    }
    if (val.action === 'create' && !val.lastName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'lastName required for create', path: ['lastName'] });
    }
  });
export type ReconcileDecision = z.infer<typeof reconcileDecisionSchema>;

/** Per-category source-column → internal-field mapping. */
export const categoryMappingsSchema = z.record(
  historicalCategorySchema,
  z.record(z.string(), z.string()),
);

export const seasonContextSchema = z.object({
  seasonYear: z.number().int().min(1900).max(2100),
  seasonLabel: z.string().max(60).nullable(),
});
export type SeasonContext = z.infer<typeof seasonContextSchema>;

/** Phase B: the confirmed mapping + reconciliation, committed to the DB. */
export const commitImportInputSchema = z.object({
  batchId: z.string().uuid(),
  leagueId: z.string().uuid(),
  confirmedCategories: z.array(historicalCategorySchema).min(1),
  mapping: categoryMappingsSchema,
  reconciliation: z.array(reconcileDecisionSchema),
  seasonContext: seasonContextSchema,
});
export type CommitImportInput = z.infer<typeof commitImportInputSchema>;

export const rollbackImportInputSchema = z.object({
  batchId: z.string().uuid(),
  leagueId: z.string().uuid(),
});
export type RollbackImportInput = z.infer<typeof rollbackImportInputSchema>;
