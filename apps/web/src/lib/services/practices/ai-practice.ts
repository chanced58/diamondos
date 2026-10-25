import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aiPracticePreviewInputSchema,
  createAiPracticeInputSchema,
  type AiPracticePlan,
  type AiPracticePreviewResponse,
} from '@baseball/shared';
import { createAiPractice } from '@baseball/database';
import { generatePractice } from '@/lib/ai/practice-generator';
import { logAiGeneration } from '@/lib/ai/log-generation';
import { AI_MODELS } from '@/lib/ai/client';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { failed } from './practice-lookup';
import { loadTeamDrills } from './team-drills';

/**
 * Practices drafted by Claude from a coach's description and the team's drill
 * library (the web "Generate with AI" page), shared with the mobile routes.
 * The preview creates nothing; the coach then saves it as a practice. Coaches
 * only (`resolveGameViewer`).
 */

const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;

export async function previewAiPractice(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<AiPracticePreviewResponse>> {
  const parsed = aiPracticePreviewInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, input.teamId);
  if (!viewer?.isCoach) return serviceError('forbidden', 'Only coaches can generate AI practices.');

  const start = Date.now();
  try {
    const drills = await loadTeamDrills(db, input.teamId);
    const result = await generatePractice({
      coachPrompt: input.coachPrompt,
      durationMinutes: input.durationMinutes,
      playerCount: input.playerCount,
      availableFieldSpaces: input.availableFieldSpaces,
      drills,
    });
    if (result.unknownDrillIds.length > 0) {
      console.warn('[previewAiPractice] model returned unknown drill ids', { teamId: input.teamId, unknown: result.unknownDrillIds });
    }
    await logAiGeneration({
      feature: 'practice_generator',
      teamId: input.teamId,
      userId: actorUserId,
      model: AI_MODELS.opus,
      usage: result.usage,
      latencyMs: Date.now() - start,
      status: 'success',
    });
    return serviceOk({
      plan: result.plan,
      drillsById: Object.fromEntries(drills.map((d) => [d.id, d.name])),
      unknownDrillIds: result.unknownDrillIds,
      durationMismatchWarning: result.durationMismatchWarning,
    });
  } catch (error) {
    await logAiGeneration({
      feature: 'practice_generator',
      teamId: input.teamId,
      userId: actorUserId,
      model: AI_MODELS.opus,
      latencyMs: Date.now() - start,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return failed('previewAiPractice', input.teamId, actorUserId, error);
  }
}

/** Saves a previewed plan as a practice within a year either side of today. */
export async function createPracticeFromAiPlan(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = createAiPracticeInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const scheduledAt = Date.parse(input.scheduledAt);
  if (Math.abs(scheduledAt - Date.now()) > ONE_YEAR_MS) {
    return serviceError('invalid', 'Practice date must be within a year of today.');
  }

  const viewer = await resolveGameViewer(db, actorUserId, input.teamId);
  if (!viewer?.isCoach) return serviceError('forbidden', 'Only coaches can create practices.');

  try {
    // A plan held in the app may name a drill the team can no longer see: drop it.
    const allowedIds = new Set((await loadTeamDrills(db, input.teamId)).map((d) => d.id));
    const plan: AiPracticePlan = {
      ...input.plan,
      blocks: input.plan.blocks.map((b) => ({ ...b, drillId: b.drillId && allowedIds.has(b.drillId) ? b.drillId : null })),
    };
    const created = await createAiPractice(db as never, {
      teamId: input.teamId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      durationMinutes: input.durationMinutes,
      plan,
      createdBy: actorUserId,
    });
    return serviceOk({ practiceId: created.practiceId });
  } catch (error) {
    return failed('createPracticeFromAiPlan', input.teamId, actorUserId, error);
  }
}
