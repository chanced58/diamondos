import { z } from 'zod';
import { PracticeFieldSpace } from '../types/practice-drill';
import { PracticeBlockType } from '../types/practice-template';

export const AiPracticeBlockSchema = z.object({
  blockType: z.nativeEnum(PracticeBlockType),
  title: z.string().min(1).max(200),
  plannedDurationMinutes: z.number().int().min(1).max(180),
  drillId: z.string().uuid().nullable(),
  fieldSpaces: z.array(z.nativeEnum(PracticeFieldSpace)),
  rationale: z.string().min(1).max(500),
});

export const AiPracticePlanSchema = z.object({
  focusSummary: z.string().min(1).max(500),
  blocks: z.array(AiPracticeBlockSchema).min(1).max(20),
});

export type AiPracticeBlock = z.infer<typeof AiPracticeBlockSchema>;
export type AiPracticePlan = z.infer<typeof AiPracticePlanSchema>;
