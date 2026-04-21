import { z } from 'zod';
import {
  PracticeAgeLevel,
  PracticeDrillVisibility,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
} from '../types/practice-drill';

export const createDrillSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(120),
    description: z.string().max(4000).optional(),
    defaultDurationMinutes: z.number().int().min(1).max(240).optional(),
    skillCategories: z
      .array(z.nativeEnum(PracticeSkillCategory))
      .min(1, 'Pick at least one skill category'),
    positions: z.array(z.string().max(4)).max(20).optional().default([]),
    ageLevels: z
      .array(z.nativeEnum(PracticeAgeLevel))
      .optional()
      .default([PracticeAgeLevel.ALL]),
    equipment: z
      .array(z.nativeEnum(PracticeEquipment))
      .optional()
      .default([]),
    fieldSpaces: z
      .array(z.nativeEnum(PracticeFieldSpace))
      .optional()
      .default([]),
    minPlayers: z.number().int().min(1).max(50).optional(),
    maxPlayers: z.number().int().min(1).max(50).optional(),
    coachingPoints: z.string().max(4000).optional(),
    tags: z.array(z.string().min(1).max(30)).max(20).optional().default([]),
    diagramUrl: z.string().url().optional().or(z.literal('')),
    videoUrl: z.string().url().optional().or(z.literal('')),
  })
  .refine(
    (d) =>
      d.minPlayers === undefined ||
      d.maxPlayers === undefined ||
      d.maxPlayers >= d.minPlayers,
    { message: 'maxPlayers must be >= minPlayers', path: ['maxPlayers'] },
  );

export const updateDrillSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(4000).optional(),
    defaultDurationMinutes: z.number().int().min(1).max(240).optional(),
    skillCategories: z.array(z.nativeEnum(PracticeSkillCategory)).optional(),
    positions: z.array(z.string().max(4)).max(20).optional(),
    ageLevels: z.array(z.nativeEnum(PracticeAgeLevel)).optional(),
    equipment: z.array(z.nativeEnum(PracticeEquipment)).optional(),
    fieldSpaces: z.array(z.nativeEnum(PracticeFieldSpace)).optional(),
    minPlayers: z.number().int().min(1).max(50).optional(),
    maxPlayers: z.number().int().min(1).max(50).optional(),
    coachingPoints: z.string().max(4000).optional(),
    tags: z.array(z.string().min(1).max(30)).max(20).optional(),
    diagramUrl: z.string().url().optional().or(z.literal('')),
    videoUrl: z.string().url().optional().or(z.literal('')),
  })
  .refine(
    (d) =>
      d.minPlayers === undefined ||
      d.maxPlayers === undefined ||
      d.maxPlayers >= d.minPlayers,
    { message: 'maxPlayers must be >= minPlayers', path: ['maxPlayers'] },
  );

export const drillFiltersSchema = z.object({
  skillCategories: z.array(z.nativeEnum(PracticeSkillCategory)).optional(),
  positions: z.array(z.string().max(4)).optional(),
  ageLevels: z.array(z.nativeEnum(PracticeAgeLevel)).optional(),
  equipment: z.array(z.nativeEnum(PracticeEquipment)).optional(),
  fieldSpaces: z.array(z.nativeEnum(PracticeFieldSpace)).optional(),
  search: z.string().max(100).optional(),
  minPlayers: z.number().int().min(1).optional(),
  maxPlayers: z.number().int().min(1).optional(),
  durationMax: z.number().int().min(1).max(600).optional(),
  visibility: z.enum(['system', 'team', 'all']).optional(),
});

export const drillAttachmentSchema = z.object({
  drillId: z.string().uuid(),
  storagePath: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(100),
  kind: z.enum(['video', 'diagram', 'pdf', 'image']),
  sizeBytes: z.number().int().positive().optional(),
});

export type CreateDrillInput = z.infer<typeof createDrillSchema>;
export type UpdateDrillInput = z.infer<typeof updateDrillSchema>;
export type DrillFiltersInput = z.infer<typeof drillFiltersSchema>;
export type DrillAttachmentInput = z.infer<typeof drillAttachmentSchema>;

// Re-exported for convenience of consumers that import from validation only.
export { PracticeDrillVisibility };
