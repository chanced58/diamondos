'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import {
  PracticeAgeLevel,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
  updateDrillSchema,
} from '@baseball/shared';
import { deleteDrill, getDrillById, updateDrill } from '@baseball/database';
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

export async function updateDrillAction(
  _prev: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const id = formData.get('id') as string | null;
  const teamId = formData.get('teamId') as string | null;
  if (!id || !teamId) return 'Missing drill or team id.';

  const supabase = createPracticeServiceClient();
  try {
    await assertCoachOnTeam(supabase, user.id, teamId);
  } catch (e) {
    return e instanceof Error ? e.message : 'Not authorized.';
  }

  // Coach-on-team-A must not be able to modify drill-owned-by-team-B by
  // passing that drill's id. Verify ownership by loading the row via the
  // service client (RLS is bypassed) and comparing team_id.
  const existing = await getDrillById(supabase, id);
  if (!existing) return 'Drill not found.';
  if (existing.visibility === 'system' || existing.teamId !== teamId) {
    return 'Not authorized.';
  }

  const raw = {
    id,
    name: stringOrUndef(formData.get('name')),
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

  const parsed = updateDrillSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? 'Invalid drill data.';
  }

  try {
    await updateDrill(supabase, id, {
      name: parsed.data.name,
      description: parsed.data.description,
      defaultDurationMinutes: parsed.data.defaultDurationMinutes,
      skillCategories: parsed.data.skillCategories,
      positions: parsed.data.positions,
      ageLevels: parsed.data.ageLevels,
      equipment: parsed.data.equipment,
      fieldSpaces: parsed.data.fieldSpaces,
      minPlayers: parsed.data.minPlayers,
      maxPlayers: parsed.data.maxPlayers,
      coachingPoints: parsed.data.coachingPoints,
      tags: parsed.data.tags,
      diagramUrl: parsed.data.diagramUrl || undefined,
      videoUrl: parsed.data.videoUrl || undefined,
    });
  } catch (e) {
    return e instanceof Error ? e.message : 'Failed to update drill.';
  }
  // redirect() throws a NEXT_REDIRECT sentinel by design — keep it outside
  // the try/catch so we don't have to sniff the error message.
  redirect(`/practices/drills/${id}`);
}

export async function deleteDrillAction(formData: FormData): Promise<void> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/sign-in');

  const id = formData.get('id') as string | null;
  const teamId = formData.get('teamId') as string | null;
  if (!id || !teamId) redirect('/practices/drills');

  const supabase = createPracticeServiceClient();
  try {
    await assertCoachOnTeam(supabase, user.id, teamId);
  } catch {
    redirect(`/practices/drills/${id}`);
  }

  const drill = await getDrillById(supabase, id);
  if (drill?.teamId !== teamId) {
    redirect(`/practices/drills/${id}`);
  }

  await deleteDrill(supabase, id);
  redirect('/practices/drills');
}
