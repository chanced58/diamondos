import { z } from 'zod';
import { PracticeFieldSpace } from '../types/practice-drill';
import { PracticeBlockType } from '../types/practice-template';
import { PracticeWeatherMode } from '../types/practice';

export const upsertBlockSchema = z.object({
  id: z.string().uuid().optional(),
  practiceId: z.string().uuid(),
  position: z.number().int().min(0),
  blockType: z.nativeEnum(PracticeBlockType),
  title: z.string().min(1).max(120),
  plannedDurationMinutes: z.number().int().min(1).max(600),
  drillId: z.string().uuid().nullable().optional(),
  assignedCoachId: z.string().uuid().nullable().optional(),
  fieldSpaces: z
    .array(z.nativeEnum(PracticeFieldSpace))
    .optional()
    .default([]),
  notes: z.string().max(2000).optional(),
});

export const reorderBlocksSchema = z.object({
  practiceId: z.string().uuid(),
  order: z.array(z.string().uuid()).min(1),
});

export const assignPlayersToBlockSchema = z.object({
  blockId: z.string().uuid(),
  playerIds: z.array(z.string().uuid()),
});

export const stationSchema = z.object({
  id: z.string().uuid().optional(),
  blockId: z.string().uuid(),
  position: z.number().int().min(0),
  name: z.string().min(1).max(120),
  drillId: z.string().uuid().nullable().optional(),
  coachId: z.string().uuid().nullable().optional(),
  fieldSpace: z.nativeEnum(PracticeFieldSpace).nullable().optional(),
  rotationDurationMinutes: z.number().int().min(1).max(240),
  rotationCount: z.number().int().min(1).max(12),
  notes: z.string().max(1000).optional(),
});

export const generateStationAssignmentsSchema = z.object({
  blockId: z.string().uuid(),
  playerIds: z.array(z.string().uuid()).min(1),
});

export const weatherSwapSchema = z.object({
  practiceId: z.string().uuid(),
  targetMode: z.nativeEnum(PracticeWeatherMode),
  indoorTemplateId: z.string().uuid().optional(),
});

export const compressRemainingSchema = z.object({
  practiceId: z.string().uuid(),
  targetEndAt: z.string().datetime(),
});

export const instantiatePracticeSchema = z.object({
  practiceId: z.string().uuid(),
  templateId: z.string().uuid(),
});

export const startBlockSchema = z.object({
  blockId: z.string().uuid(),
  startedAt: z.string().datetime(),
});

export const completeBlockSchema = z.object({
  blockId: z.string().uuid(),
  completedAt: z.string().datetime(),
  actualDurationMinutes: z.number().int().min(0).max(600),
});

export const markPracticeStartedSchema = z.object({
  practiceId: z.string().uuid(),
  startedAt: z.string().datetime(),
});

export const markPracticeCompletedSchema = z.object({
  practiceId: z.string().uuid(),
  completedAt: z.string().datetime(),
});

export type UpsertBlockInput = z.infer<typeof upsertBlockSchema>;
export type ReorderBlocksInput = z.infer<typeof reorderBlocksSchema>;
export type AssignPlayersToBlockInput = z.infer<
  typeof assignPlayersToBlockSchema
>;
export type StationInput = z.infer<typeof stationSchema>;
export type GenerateStationAssignmentsInput = z.infer<
  typeof generateStationAssignmentsSchema
>;
export type WeatherSwapInput = z.infer<typeof weatherSwapSchema>;
export type CompressRemainingInput = z.infer<typeof compressRemainingSchema>;
export type InstantiatePracticeInput = z.infer<
  typeof instantiatePracticeSchema
>;
export type StartBlockInput = z.infer<typeof startBlockSchema>;
export type CompleteBlockInput = z.infer<typeof completeBlockSchema>;
export type MarkPracticeStartedInput = z.infer<
  typeof markPracticeStartedSchema
>;
export type MarkPracticeCompletedInput = z.infer<
  typeof markPracticeCompletedSchema
>;
