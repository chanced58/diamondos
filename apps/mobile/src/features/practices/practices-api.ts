import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  practiceDetailResponseSchema,
  practiceRunResponseSchema,
  practicesListResponseSchema,
  type CancelPracticeInput,
  type CreatePracticeInput,
  type LogPracticeRepInput,
  type PracticeDetailResponse,
  type PracticeRunResponse,
  type PracticesListResponse,
  type RunPracticeInput,
  type SavePracticeNotesInput,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * The practice day: list, create, detail, notes, reps and the runner. All
 * through `/api/m/v1` (the web does these with the service role), online-only.
 */

type WithoutPractice<T> = Omit<T, 'practiceId'>;

const practicePath = (practiceId: string) => `/practices/${encodeURIComponent(practiceId)}`;
const practiceIdResult = z.object({ practiceId: z.string() });

/** Cache key for a team's practice list. */
export const practicesQueryKey = (teamId: string) => ['teams', teamId, 'practices'] as const;
/** Cache key for one practice's detail. */
export const practiceQueryKey = (practiceId: string) => ['practices', practiceId] as const;
/** Cache key for one practice's runner. */
export const practiceRunQueryKey = (practiceId: string) => ['practices', practiceId, 'run'] as const;

/** The team's practices; a forbidden error on a plan without practice planning. */
export function fetchPractices(teamId: string, client: ApiClient = apiClient): Promise<PracticesListResponse> {
  return client.get(`/teams/${encodeURIComponent(teamId)}/practices`, practicesListResponseSchema);
}

/** One practice as the caller's role sees it. */
export function fetchPractice(practiceId: string, client: ApiClient = apiClient): Promise<PracticeDetailResponse> {
  return client.get(practicePath(practiceId), practiceDetailResponseSchema);
}

/** The runner: blocks in order, and which of them the caller controls. */
export function fetchPracticeRun(practiceId: string, client: ApiClient = apiClient): Promise<PracticeRunResponse> {
  return client.get(`${practicePath(practiceId)}/run`, practiceRunResponseSchema);
}

/** Logs a practice for the input's team; resolves to the new practice's id. */
export function createPractice(input: CreatePracticeInput, client: ApiClient = apiClient) {
  const { teamId, ...fields } = input;
  return client.post(`/teams/${encodeURIComponent(teamId)}/practices`, fields, practiceIdResult);
}

/** Cancels the practice, announcing it to the team when `notifyTeam` is set. */
export function cancelPractice(practiceId: string, fields: WithoutPractice<CancelPracticeInput>, client: ApiClient = apiClient) {
  return client.post(`${practicePath(practiceId)}/cancel`, fields, practiceIdResult);
}

/** Saves the practice's plan text. */
export function savePracticePlan(practiceId: string, plan: string, client: ApiClient = apiClient) {
  return client.patch(`${practicePath(practiceId)}/plan`, { plan }, practiceIdResult);
}

/** Saves the coach's notes; fields and players left out are kept as they are. */
export function savePracticeNotes(practiceId: string, fields: WithoutPractice<SavePracticeNotesInput>, client: ApiClient = apiClient) {
  return client.put(`${practicePath(practiceId)}/notes`, fields, practiceIdResult);
}

/** Saves a player's own reflection on the practice. */
export function savePracticeSelfNotes(practiceId: string, playerId: string, playerNotes: string, client: ApiClient = apiClient) {
  return client.put(`${practicePath(practiceId)}/self-notes`, { playerId, playerNotes }, practiceIdResult);
}

/** Logs one BP rep for a hitter. */
export function logPracticeRep(practiceId: string, fields: WithoutPractice<LogPracticeRepInput>, client: ApiClient = apiClient) {
  return client.post(`${practicePath(practiceId)}/reps`, fields, practiceIdResult);
}

/** One runner action; answers the runner as it now stands. */
export function runPracticeAction(
  practiceId: string,
  action: RunPracticeInput extends infer U ? (U extends unknown ? WithoutPractice<U> : never) : never,
  client: ApiClient = apiClient,
): Promise<PracticeRunResponse> {
  return client.post(`${practicePath(practiceId)}/run`, action, practiceRunResponseSchema);
}

/** The active team's practice list, while a team is selected. */
export function usePractices(teamId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: practicesQueryKey(teamId ?? ''),
    queryFn: () => fetchPractices(teamId ?? ''),
    enabled: Boolean(teamId) && enabled,
  });
}

/** One practice's detail. */
export function usePractice(practiceId: string) {
  return useQuery({
    queryKey: practiceQueryKey(practiceId),
    queryFn: () => fetchPractice(practiceId),
    enabled: practiceId.length > 0,
  });
}

/** Several coaches can run one practice (each their own blocks), so the runner polls until it is finished. */
export const PRACTICE_RUN_POLL_MS = 15_000;

/** One practice's runner, polled until the practice is finished. */
export function usePracticeRun(practiceId: string) {
  return useQuery({
    queryKey: practiceRunQueryKey(practiceId),
    queryFn: () => fetchPracticeRun(practiceId),
    enabled: practiceId.length > 0,
    refetchInterval: (query) => (query.state.data?.practice.runStatus === 'completed' ? false : PRACTICE_RUN_POLL_MS),
  });
}
