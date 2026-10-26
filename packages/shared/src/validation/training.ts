import { z } from 'zod';

/**
 * Contracts for DiamondOS training on the phone (`GET /api/m/v1/training`,
 * `POST /api/m/v1/training/:slug/complete`). The modules themselves —
 * sections and quizzes — ship in `TRAINING_MODULES`; the server keeps each
 * user's completions for the current curriculum version and their certification.
 */

export const trainingProgressResponseSchema = z.object({
  /** Modules completed in the current curriculum version. */
  completedSlugs: z.array(z.string()),
  isCertified: z.boolean(),
  curriculumVersion: z.string(),
  /** Training is offered to coaching staff, as on the web sidebar. */
  offered: z.boolean(),
});
export type TrainingProgressResponse = z.infer<typeof trainingProgressResponseSchema>;

export const completeTrainingModuleInputSchema = z.object({ slug: z.string().trim().min(1, 'Missing module.').max(100) });
export type CompleteTrainingModuleInput = z.input<typeof completeTrainingModuleInputSchema>;

export const completeTrainingModuleResponseSchema = z.object({
  /** This completion finished the curriculum and earned the Certified badge. */
  certifiedNow: z.boolean(),
  /** The next module to take, or null when every one is done. */
  nextSlug: z.string().nullable(),
  progress: trainingProgressResponseSchema,
});
export type CompleteTrainingModuleResponse = z.infer<typeof completeTrainingModuleResponseSchema>;
