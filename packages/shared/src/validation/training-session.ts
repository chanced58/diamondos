import { z } from 'zod';

/** Shared primitives — non-negative finite numbers for sensor readings. */
const metric = z.number().finite().nonnegative();

export const rapsodoHittingMetricsSchema = z.object({
  kind: z.literal('rapsodo_hitting'),
  swings: z.number().int().nonnegative(),
  avgExitVelocity: metric.optional(),
  maxExitVelocity: metric.optional(),
  avgLaunchAngle: z.number().finite().optional(),
  avgDistance: metric.optional(),
});

export const rapsodoPitchingMetricsSchema = z.object({
  kind: z.literal('rapsodo_pitching'),
  pitches: z.number().int().nonnegative(),
  avgVelocity: metric.optional(),
  maxVelocity: metric.optional(),
  avgSpinRate: metric.optional(),
  avgExtension: metric.optional(),
});

export const blastSwingMetricsSchema = z.object({
  kind: z.literal('blast_swing'),
  swings: z.number().int().nonnegative(),
  avgBatSpeed: metric.optional(),
  maxBatSpeed: metric.optional(),
  avgAttackAngle: z.number().finite().optional(),
  avgTimeToContact: metric.optional(),
});

export const hittraxSessionMetricsSchema = z.object({
  kind: z.literal('hittrax_session'),
  swings: z.number().int().nonnegative(),
  avgExitVelocity: metric.optional(),
  maxExitVelocity: metric.optional(),
  avgDistance: metric.optional(),
  maxDistance: metric.optional(),
});

export const trainingSessionMetricsSchema = z.discriminatedUnion('kind', [
  rapsodoHittingMetricsSchema,
  rapsodoPitchingMetricsSchema,
  blastSwingMetricsSchema,
  hittraxSessionMetricsSchema,
]);

export const trainingSessionServiceSchema = z.enum([
  'rapsodo',
  'blast',
  'hittrax',
  'pocket_radar',
  'diamond_kinetics',
]);

export const trainingSessionInsertSchema = z.object({
  teamId: z.string().uuid(),
  playerId: z.string().uuid(),
  service: trainingSessionServiceSchema,
  externalSessionId: z.string().trim().min(1).max(200).nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }),
  metrics: trainingSessionMetricsSchema,
  importedBy: z.string().uuid().nullable().optional(),
});

export type TrainingSessionInsertInput = z.infer<typeof trainingSessionInsertSchema>;
