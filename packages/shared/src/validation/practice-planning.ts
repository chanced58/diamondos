import { z } from 'zod';
import { AiPracticePlanSchema } from '../ai/practice-plan-schema';
import { AiPracticeSummarySchema } from '../ai/practice-summary-schema';
import { PracticeFieldSpace } from '../types/practice-drill';
import { PracticeBlockType, PracticeSeasonPhase, PracticeTemplateKind } from '../types/practice-template';

/**
 * Contracts for planning practices — AI-generated practices, game prep, the
 * AI post-practice summary and templates — shared by the web server actions
 * and the mobile `/api/m/v1` routes. Template building itself stays on the web.
 */

const uuid = (message: string) => z.string().uuid(message);
const isoDateTime = z.string().datetime({ offset: true });

// ─── AI-generated practice ───────────────────────────────────────────────────

/** The fields the web form starts with checked. */
export const DEFAULT_AI_FIELD_SPACES: PracticeFieldSpace[] = [
  PracticeFieldSpace.INFIELD,
  PracticeFieldSpace.OUTFIELD,
  PracticeFieldSpace.CAGE_1,
  PracticeFieldSpace.BULLPEN_1,
];

const aiDuration = z
  .number()
  .int('Duration must be a whole number of minutes.')
  .min(15, 'Duration must be between 15 and 240 minutes.')
  .max(240, 'Duration must be between 15 and 240 minutes.');

export const aiPracticePreviewInputSchema = z.object({
  teamId: uuid('Missing team.'),
  coachPrompt: z
    .string()
    .trim()
    .min(5, 'Describe what you want the practice to focus on (at least a sentence).')
    .max(2000, 'That description is too long.'),
  durationMinutes: aiDuration,
  playerCount: z
    .number()
    .int('Player count must be a whole number.')
    .min(1, 'Player count must be between 1 and 50.')
    .max(50, 'Player count must be between 1 and 50.'),
  availableFieldSpaces: z.array(z.nativeEnum(PracticeFieldSpace)).max(20).default(DEFAULT_AI_FIELD_SPACES),
});
export type AiPracticePreviewInput = z.input<typeof aiPracticePreviewInputSchema>;

export const aiPracticePreviewResponseSchema = z.object({
  plan: AiPracticePlanSchema,
  /** Names of the drills the plan can use, by id. */
  drillsById: z.record(z.string(), z.string()),
  /** Drill ids the model made up; they are dropped when the practice is created. */
  unknownDrillIds: z.array(z.string()),
  durationMismatchWarning: z.string().nullable(),
});
export type AiPracticePreviewResponse = z.infer<typeof aiPracticePreviewResponseSchema>;

export const createAiPracticeInputSchema = z.object({
  teamId: uuid('Missing team.'),
  scheduledAt: isoDateTime,
  durationMinutes: aiDuration,
  plan: AiPracticePlanSchema,
});
export type CreateAiPracticeInput = z.input<typeof createAiPracticeInputSchema>;

// ─── Prep for the next game ──────────────────────────────────────────────────

export const prepPreviewInputSchema = z.object({
  teamId: uuid('Missing team.'),
  durationMinutes: z.coerce.number().int().min(30).max(180).default(90),
  /** Anchor the weaknesses to this completed game instead of the most recent one. */
  sourceGameId: uuid('Unknown game.').nullish().transform((value) => value ?? null),
});
export type PrepPreviewInput = z.input<typeof prepPreviewInputSchema>;

export const suggestedBlockSchema = z.object({
  position: z.number().int().min(0).max(100),
  blockType: z.nativeEnum(PracticeBlockType),
  title: z.string().trim().min(1).max(200),
  plannedDurationMinutes: z.number().int().min(1).max(180),
  drillId: z.string().uuid().optional(),
  rationale: z.string().max(1000),
  addressedDeficitIds: z.array(z.string()).max(50),
  addressedTagValues: z.array(z.string()).max(50),
});

export const prepPreviewResponseSchema = z.object({
  /** Null when the team has no upcoming game with a named opponent. */
  nextGame: z
    .object({ id: z.string(), opponentName: z.string(), scheduledAt: z.string(), timeZone: z.string().nullable() })
    .nullable(),
  durationMinutes: z.number(),
  focusSummary: z.string(),
  /** Some target weaknesses have no matching drill in the library. */
  hasGaps: z.boolean(),
  blocks: z.array(suggestedBlockSchema),
  drillsById: z.record(z.string(), z.string()),
  weaknessLabels: z.array(z.string()),
  tendencyLabels: z.array(z.string()),
});
export type PrepPreviewResponse = z.infer<typeof prepPreviewResponseSchema>;

export const createPrepPracticeInputSchema = z.object({
  teamId: uuid('Missing team.'),
  linkedGameId: uuid('Missing game.'),
  scheduledAt: isoDateTime,
  durationMinutes: z.number().int().min(15).max(240),
  prepFocusSummary: z.string().trim().max(1000),
  blocks: z.array(suggestedBlockSchema).min(1, 'The plan has no blocks.').max(20),
});
export type CreatePrepPracticeInput = z.input<typeof createPrepPracticeInputSchema>;

// ─── AI post-practice summary ────────────────────────────────────────────────

export const persistedPracticeSummarySchema = AiPracticeSummarySchema.extend({
  id: z.string(),
  practiceId: z.string(),
  teamId: z.string(),
  model: z.string(),
  generatedBy: z.string().optional(),
  generatedAt: z.string(),
});

export const practiceSummaryResponseSchema = z.object({
  /** Null until a coach generates one. */
  summary: persistedPracticeSummarySchema.nullable(),
});
export type PracticeSummaryResponse = z.infer<typeof practiceSummaryResponseSchema>;

// ─── Templates ───────────────────────────────────────────────────────────────

export const practiceTemplatesInputSchema = z.object({ teamId: uuid('Missing team.') });
export type PracticeTemplatesInput = z.input<typeof practiceTemplatesInputSchema>;

export const practiceTemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.nativeEnum(PracticeTemplateKind),
  seasonPhase: z.nativeEnum(PracticeSeasonPhase),
  defaultDurationMinutes: z.number(),
  isIndoorFallback: z.boolean(),
});
export type PracticeTemplateSummary = z.infer<typeof practiceTemplateSummarySchema>;

export const practiceTemplatesResponseSchema = z.object({
  teamId: z.string(),
  /** The team's templates that aren't archived, most recently changed first. */
  templates: z.array(practiceTemplateSummarySchema),
});
export type PracticeTemplatesResponse = z.infer<typeof practiceTemplatesResponseSchema>;

export const duplicatePracticeTemplateInputSchema = z.object({
  templateId: uuid('Missing template.'),
  newName: z.string().trim().min(1, 'Name the copy.').max(120, 'That name is too long.'),
});
export type DuplicatePracticeTemplateInput = z.input<typeof duplicatePracticeTemplateInputSchema>;

export const practiceTemplateIdInputSchema = z.object({ templateId: uuid('Missing template.') });
export type PracticeTemplateIdInput = z.input<typeof practiceTemplateIdInputSchema>;

/** Replaces every block of the practice with the template's. */
export const applyPracticeTemplateInputSchema = z.object({
  practiceId: uuid('Missing practice.'),
  templateId: uuid('Missing template.'),
});
export type ApplyPracticeTemplateInput = z.input<typeof applyPracticeTemplateInputSchema>;
