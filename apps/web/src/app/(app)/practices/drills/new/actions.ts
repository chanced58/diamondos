'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import {
  PracticeAgeLevel,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
  createDrillSchema,
} from '@baseball/shared';
import { createDrill } from '@baseball/database';
import {
  assertCoachOnTeam,
  createPracticeServiceClient,
} from '@/lib/practices/authz';

function getAll<T extends string>(formData: FormData, key: string): T[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string') as T[];
}

function stringOrUndef(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function numberOrUndef(v: FormDataEntryValue | null): number | undefined {
  if (typeof v !== 'string' || v.trim().length === 0) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function createDrillAction(
  _prev: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string | null;
  if (!teamId) return 'Missing team.';

  const supabase = createPracticeServiceClient();
  try {
    await assertCoachOnTeam(supabase, user.id, teamId);
  } catch (e) {
    return e instanceof Error ? e.message : 'Not authorized.';
  }

  const raw = {
    name: stringOrUndef(formData.get('name')) ?? '',
    description: stringOrUndef(formData.get('description')),
    defaultDurationMinutes: numberOrUndef(formData.get('defaultDurationMinutes')),
    skillCategories: getAll<PracticeSkillCategory>(formData, 'skillCategories'),
    positions: getAll<string>(formData, 'positions'),
    ageLevels: getAll<PracticeAgeLevel>(formData, 'ageLevels'),
    equipment: getAll<PracticeEquipment>(formData, 'equipment'),
    fieldSpaces: getAll<PracticeFieldSpace>(formData, 'fieldSpaces'),
    minPlayers: numberOrUndef(formData.get('minPlayers')),
    maxPlayers: numberOrUndef(formData.get('maxPlayers')),
    coachingPoints: stringOrUndef(formData.get('coachingPoints')),
    tags: (stringOrUndef(formData.get('tags')) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    diagramUrl: stringOrUndef(formData.get('diagramUrl')),
    videoUrl: stringOrUndef(formData.get('videoUrl')),
  };

  const parsed = createDrillSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? 'Invalid drill data.';
  }
  const input = parsed.data;

  try {
    const created = await createDrill(supabase, {
      teamId,
      name: input.name,
      description: input.description,
      defaultDurationMinutes: input.defaultDurationMinutes,
      skillCategories: input.skillCategories,
      positions: input.positions,
      ageLevels: input.ageLevels,
      equipment: input.equipment,
      fieldSpaces: input.fieldSpaces,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      coachingPoints: input.coachingPoints,
      tags: input.tags,
      diagramUrl: input.diagramUrl || undefined,
      videoUrl: input.videoUrl || undefined,
      createdBy: user.id,
    });
    redirect(`/practices/drills/${created.id}`);
  } catch (e) {
    if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) throw e;
    return e instanceof Error ? e.message : 'Failed to create drill.';
  }
  return null;
}
