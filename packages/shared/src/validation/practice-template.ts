import { z } from 'zod';
import { PracticeFieldSpace } from '../types/practice-drill';
import {
  PracticeBlockType,
  PracticeSeasonPhase,
  PracticeTemplateKind,
} from '../types/practice-template';

export const templateBlockSchema = z.object({
  position: z.number().int().min(0),
  blockType: z.nativeEnum(PracticeBlockType),
  title: z.string().min(1).max(120),
  durationMinutes: z.number().int().min(1).max(600),
  drillId: z.string().uuid().optional(),
  fieldSpaces: z.array(z.nativeEnum(PracticeFieldSpace)).optional().default([]),
  notes: z.string().max(2000).optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  kind: z.nativeEnum(PracticeTemplateKind).default(PracticeTemplateKind.CUSTOM),
  seasonPhase: z
    .nativeEnum(PracticeSeasonPhase)
    .default(PracticeSeasonPhase.ANY),
  defaultDurationMinutes: z.number().int().min(15).max(600).default(90),
  isIndoorFallback: z.boolean().default(false),
  pairedTemplateId: z.string().uuid().optional(),
});

export const createTemplateWithBlocksSchema = createTemplateSchema.extend({
  blocks: z
    .array(templateBlockSchema)
    .min(1, 'At least one block is required'),
});

export const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  kind: z.nativeEnum(PracticeTemplateKind).optional(),
  seasonPhase: z.nativeEnum(PracticeSeasonPhase).optional(),
  defaultDurationMinutes: z.number().int().min(15).max(600).optional(),
  isIndoorFallback: z.boolean().optional(),
  pairedTemplateId: z.string().uuid().nullable().optional(),
});

export const replaceTemplateBlocksSchema = z.object({
  templateId: z.string().uuid(),
  blocks: z.array(templateBlockSchema).min(1),
});

export const duplicateTemplateSchema = z.object({
  sourceTemplateId: z.string().uuid(),
  newName: z.string().min(1).max(120),
});

export type TemplateBlockInput = z.infer<typeof templateBlockSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type CreateTemplateWithBlocksInput = z.infer<
  typeof createTemplateWithBlocksSchema
>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type ReplaceTemplateBlocksInput = z.infer<
  typeof replaceTemplateBlocksSchema
>;
export type DuplicateTemplateInput = z.infer<typeof duplicateTemplateSchema>;
