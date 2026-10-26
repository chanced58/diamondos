import { useQuery } from '@tanstack/react-query';
import {
  completeTrainingModuleResponseSchema,
  trainingProgressResponseSchema,
  type CompleteTrainingModuleResponse,
  type TrainingProgressResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * DiamondOS training through `/api/m/v1` (online-only). The modules and
 * quizzes ship in the app (`TRAINING_MODULES`); the server keeps completions
 * and certification.
 */

/** Cache key for the signed-in user's training progress. */
export const trainingProgressQueryKey = ['training', 'progress'] as const;

/** Completed modules, certification, and whether training is offered. */
export function fetchTrainingProgress(client: ApiClient = apiClient): Promise<TrainingProgressResponse> {
  return client.get('/training', trainingProgressResponseSchema);
}

/** Records a module complete; resolves to the next module and fresh progress. */
export function completeTrainingModule(slug: string, client: ApiClient = apiClient): Promise<CompleteTrainingModuleResponse> {
  return client.post(`/training/${encodeURIComponent(slug)}/complete`, {}, completeTrainingModuleResponseSchema);
}

/** The signed-in user's training progress. */
export function useTrainingProgress() {
  return useQuery({ queryKey: trainingProgressQueryKey, queryFn: () => fetchTrainingProgress() });
}
