import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  aiPracticePreviewResponseSchema,
  practiceSummaryResponseSchema,
  practiceTemplatesResponseSchema,
  prepPreviewResponseSchema,
  type AiPracticePreviewInput,
  type AiPracticePreviewResponse,
  type CreateAiPracticeInput,
  type CreatePrepPracticeInput,
  type PracticeSummaryResponse,
  type PracticeTemplatesResponse,
  type PrepPreviewResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * Planning practices: AI-generated practices, prep for the next game, the AI
 * post-practice summary and templates. All through `/api/m/v1`, online-only.
 * The AI calls wait on the model, so they get a long timeout.
 */

/** How long an AI generation may take before the app gives up. */
export const AI_PLANNING_TIMEOUT_MS = 180_000;

type WithoutTeam<T> = Omit<T, 'teamId'>;

const teamPath = (teamId: string) => `/teams/${encodeURIComponent(teamId)}`;
const practicePath = (practiceId: string) => `/practices/${encodeURIComponent(practiceId)}`;
const templatePath = (templateId: string) => `/practice-templates/${encodeURIComponent(templateId)}`;
const practiceIdResult = z.object({ practiceId: z.string() });
const templateIdResult = z.object({ templateId: z.string() });

/** Cache key for a team's prep suggestion at one duration. */
export const prepPreviewQueryKey = (teamId: string, durationMinutes: number) => ['teams', teamId, 'practice-prep', durationMinutes] as const;
/** Cache key for a practice's AI summary. */
export const practiceSummaryQueryKey = (practiceId: string) => ['practices', practiceId, 'summary'] as const;
/** Cache key for a team's templates. */
export const practiceTemplatesQueryKey = (teamId: string) => ['teams', teamId, 'practice-templates'] as const;

/** Claude drafts a practice from the description; nothing is saved. */
export function previewAiPractice(
  teamId: string,
  fields: WithoutTeam<AiPracticePreviewInput>,
  client: ApiClient = apiClient,
): Promise<AiPracticePreviewResponse> {
  return client.request(`${teamPath(teamId)}/practices/ai-preview`, {
    method: 'POST',
    body: fields,
    schema: aiPracticePreviewResponseSchema,
    timeoutMs: AI_PLANNING_TIMEOUT_MS,
  });
}

/** Saves a previewed AI plan as a practice. */
export function createAiPractice(teamId: string, fields: WithoutTeam<CreateAiPracticeInput>, client: ApiClient = apiClient) {
  return client.post(`${teamPath(teamId)}/practices/ai`, fields, practiceIdResult);
}

/** The suggested prep practice for the team's next game. */
export function fetchPrepPreview(teamId: string, durationMinutes: number, client: ApiClient = apiClient): Promise<PrepPreviewResponse> {
  return client.get(`${teamPath(teamId)}/practice-prep?duration=${durationMinutes}`, prepPreviewResponseSchema);
}

/** Saves the prep plan as a practice linked to the game. */
export function createPrepPractice(teamId: string, fields: WithoutTeam<CreatePrepPracticeInput>, client: ApiClient = apiClient) {
  return client.post(`${teamPath(teamId)}/practice-prep`, fields, practiceIdResult);
}

/** The practice's saved AI summary (null before one is generated). */
export function fetchPracticeSummary(practiceId: string, client: ApiClient = apiClient): Promise<PracticeSummaryResponse> {
  return client.get(`${practicePath(practiceId)}/summary`, practiceSummaryResponseSchema);
}

/** Generates (or regenerates) the practice's AI summary. */
export function generatePracticeSummary(practiceId: string, client: ApiClient = apiClient): Promise<PracticeSummaryResponse> {
  return client.request(`${practicePath(practiceId)}/summary`, {
    method: 'POST',
    body: {},
    schema: practiceSummaryResponseSchema,
    timeoutMs: AI_PLANNING_TIMEOUT_MS,
  });
}

/** The team's templates that aren't archived. */
export function fetchPracticeTemplates(teamId: string, client: ApiClient = apiClient): Promise<PracticeTemplatesResponse> {
  return client.get(`${teamPath(teamId)}/practice-templates`, practiceTemplatesResponseSchema);
}

/** Copies a template under a new name; resolves to the copy's id. */
export function duplicatePracticeTemplate(templateId: string, newName: string, client: ApiClient = apiClient) {
  return client.post(`${templatePath(templateId)}/duplicate`, { newName }, templateIdResult);
}

/** Archives a template. */
export function archivePracticeTemplate(templateId: string, client: ApiClient = apiClient) {
  return client.post(`${templatePath(templateId)}/archive`, {}, templateIdResult);
}

/** Replaces the practice's blocks with the template's. */
export function applyPracticeTemplate(practiceId: string, templateId: string, client: ApiClient = apiClient) {
  return client.post(`${practicePath(practiceId)}/apply-template`, { templateId }, practiceIdResult);
}

/** The prep suggestion for the active team. */
export function usePrepPreview(teamId: string | undefined, durationMinutes: number) {
  return useQuery({
    queryKey: prepPreviewQueryKey(teamId ?? '', durationMinutes),
    queryFn: () => fetchPrepPreview(teamId ?? '', durationMinutes),
    enabled: Boolean(teamId),
  });
}

/** A practice's AI summary, for coaches. */
export function usePracticeSummary(practiceId: string, enabled = true) {
  return useQuery({
    queryKey: practiceSummaryQueryKey(practiceId),
    queryFn: () => fetchPracticeSummary(practiceId),
    enabled: practiceId.length > 0 && enabled,
  });
}

/** The active team's templates. */
export function usePracticeTemplates(teamId: string | undefined) {
  return useQuery({
    queryKey: practiceTemplatesQueryKey(teamId ?? ''),
    queryFn: () => fetchPracticeTemplates(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}
