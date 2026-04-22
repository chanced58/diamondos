'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  AiPracticePlanSchema,
  PracticeFieldSpace,
  type AiPracticePlan,
  type PracticeDrill,
  type PracticeDrillVisibility,
} from '@baseball/shared';
import { createAiPractice } from '@baseball/database';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { generatePractice } from '@/lib/ai/practice-generator';
import { logAiGeneration } from '@/lib/ai/log-generation';
import { AI_MODELS } from '@/lib/ai/client';

type SupabaseUntyped = SupabaseClient;

export interface GenerateInput {
  teamId: string;
  coachPrompt: string;
  durationMinutes: number;
  playerCount: number;
  availableFieldSpaces: PracticeFieldSpace[];
}

export interface GenerateSuccess {
  plan: AiPracticePlan;
  drillsById: Record<string, string>;
  unknownDrillIds: string[];
  durationMismatchWarning: string | null;
}

export async function generateAiPracticeAction(
  input: GenerateInput,
): Promise<GenerateSuccess | string> {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const { isCoach } = await getUserAccess(input.teamId, user.id);
  if (!isCoach) return 'Only coaches can generate AI practices.';

  if (input.coachPrompt.trim().length < 5) {
    return 'Describe what you want the practice to focus on (at least a sentence).';
  }
  if (input.durationMinutes < 15 || input.durationMinutes > 240) {
    return 'Duration must be between 15 and 240 minutes.';
  }
  if (input.playerCount < 1 || input.playerCount > 50) {
    return 'Player count must be between 1 and 50.';
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const start = Date.now();
  try {
    const drills = await loadDrills(db, input.teamId);
    const result = await generatePractice({
      coachPrompt: input.coachPrompt,
      durationMinutes: input.durationMinutes,
      playerCount: input.playerCount,
      availableFieldSpaces: input.availableFieldSpaces,
      drills,
    });

    if (result.unknownDrillIds.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[ai/practice-generate] model returned unknown drill ids', {
        teamId: input.teamId,
        unknown: result.unknownDrillIds,
      });
    }

    await logAiGeneration({
      feature: 'practice_generator',
      teamId: input.teamId,
      userId: user.id,
      model: AI_MODELS.opus,
      usage: result.usage,
      latencyMs: Date.now() - start,
      status: 'success',
    });

    return {
      plan: result.plan,
      drillsById: Object.fromEntries(drills.map((d) => [d.id, d.name])),
      unknownDrillIds: result.unknownDrillIds,
      durationMismatchWarning: result.durationMismatchWarning,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await logAiGeneration({
      feature: 'practice_generator',
      teamId: input.teamId,
      userId: user.id,
      model: AI_MODELS.opus,
      latencyMs: Date.now() - start,
      status: 'error',
      errorMessage: msg,
    });
    return `AI generation failed: ${msg}`;
  }
}

export interface CreateFromPlanInput {
  teamId: string;
  scheduledAt: string;
  durationMinutes: number;
  plan: AiPracticePlan;
}

export async function createPracticeFromAiPlanAction(
  input: CreateFromPlanInput,
): Promise<{ practiceId: string } | string> {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const { isCoach } = await getUserAccess(input.teamId, user.id);
  if (!isCoach) return 'Only coaches can create practices.';

  // Re-validate the client-supplied payload server-side. The browser could
  // have mutated plan shape between generate and save, so we never trust the
  // in-memory object on the client.
  const parsed = AiPracticePlanSchema.safeParse(input.plan);
  if (!parsed.success) {
    return `Invalid practice plan: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`;
  }

  const scheduledAtDate = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAtDate.getTime())) {
    return 'Practice date is invalid.';
  }
  const oneYear = 365 * 24 * 3600 * 1000;
  const now = Date.now();
  if (
    scheduledAtDate.getTime() < now - oneYear ||
    scheduledAtDate.getTime() > now + oneYear
  ) {
    return 'Practice date must be within ±1 year of today.';
  }

  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 15 ||
    input.durationMinutes > 240
  ) {
    return 'Duration must be an integer between 15 and 240 minutes.';
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Defense-in-depth: strip any drillId that isn't visible to this team before
  // persisting. The AI generator already validates against the catalog, but a
  // stale plan sitting in the browser might reference a drill the team no
  // longer sees.
  const drills = await loadDrills(db, input.teamId);
  const allowedIds = new Set(drills.map((d) => d.id));
  const sanitizedPlan: AiPracticePlan = {
    ...parsed.data,
    blocks: parsed.data.blocks.map((b) => ({
      ...b,
      drillId: b.drillId && allowedIds.has(b.drillId) ? b.drillId : null,
    })),
  };

  try {
    const result = await createAiPractice(db as never, {
      teamId: input.teamId,
      scheduledAt: scheduledAtDate.toISOString(),
      durationMinutes: input.durationMinutes,
      plan: sanitizedPlan,
      createdBy: user.id,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return `Failed to create practice: ${msg}`;
  }
}

async function loadDrills(
  db: SupabaseUntyped,
  teamId: string,
): Promise<PracticeDrill[]> {
  const { data, error } = await db
    .from('practice_drills')
    .select('*')
    .or(`team_id.is.null,team_id.eq.${teamId}`);
  if (error) throw new Error(`Failed to load drills: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    teamId: (r.team_id as string | null) ?? null,
    visibility: r.visibility as PracticeDrillVisibility,
    name: r.name as string,
    description: (r.description as string | null) ?? undefined,
    defaultDurationMinutes:
      (r.default_duration_minutes as number | null) ?? undefined,
    skillCategories:
      (r.skill_categories as PracticeDrill['skillCategories']) ?? [],
    positions: (r.positions as string[]) ?? [],
    ageLevels: (r.age_levels as PracticeDrill['ageLevels']) ?? [],
    equipment: (r.equipment as PracticeDrill['equipment']) ?? [],
    fieldSpaces: (r.field_spaces as PracticeDrill['fieldSpaces']) ?? [],
    minPlayers: (r.min_players as number | null) ?? undefined,
    maxPlayers: (r.max_players as number | null) ?? undefined,
    coachingPoints: (r.coaching_points as string | null) ?? undefined,
    tags: (r.tags as string[]) ?? [],
    diagramUrl: (r.diagram_url as string | null) ?? undefined,
    videoUrl: (r.video_url as string | null) ?? undefined,
    source: (r.source as string | null) ?? undefined,
    createdBy: (r.created_by as string | null) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}
