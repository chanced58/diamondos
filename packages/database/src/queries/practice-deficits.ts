import {
  createDeficitSchema,
  updateDeficitSchema,
  type CreateDeficitInput,
  type UpdateDeficitInput,
  type PracticeDeficit,
  type PracticeDrillDeficitTag,
  type DrillDeficitTagHydrated,
  PracticeDrillDeficitPriority,
  type PracticeSkillCategory,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const DEFICITS_TABLE = 'practice_deficits' as never;
const TAGS_TABLE = 'practice_drill_deficit_tags' as never;

interface RawDeficitRow {
  id: string;
  team_id: string | null;
  visibility: 'system' | 'team';
  slug: string;
  name: string;
  description: string | null;
  skill_categories: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapDeficit(row: RawDeficitRow): PracticeDeficit {
  return {
    id: row.id,
    teamId: row.team_id,
    visibility: row.visibility as PracticeDeficit['visibility'],
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    skillCategories: row.skill_categories as PracticeSkillCategory[],
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RawTagRow {
  id: string;
  drill_id: string;
  deficit_id: string;
  team_id: string | null;
  priority: 'primary' | 'secondary';
  created_by: string | null;
  created_at: string;
}

function mapTag(row: RawTagRow): PracticeDrillDeficitTag {
  return {
    id: row.id,
    drillId: row.drill_id,
    deficitId: row.deficit_id,
    teamId: row.team_id,
    priority: row.priority as PracticeDrillDeficitPriority,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * System deficits UNION the team's own deficits. Ordered by name (the client
 * may regroup by first skill_category for display).
 */
export async function listDeficitsForTeam(
  supabase: TypedSupabaseClient,
  teamId: string,
): Promise<PracticeDeficit[]> {
  const { data, error } = await supabase
    .from(DEFICITS_TABLE)
    .select('*')
    .or(`team_id.eq.${teamId},visibility.eq.system`)
    .order('name', { ascending: true });
  if (error) throw error;
  return ((data as unknown as RawDeficitRow[]) ?? []).map(mapDeficit);
}

/**
 * Team-scoped slug wins over a system slug of the same name when both exist.
 */
export async function getDeficitBySlug(
  supabase: TypedSupabaseClient,
  teamId: string,
  slug: string,
): Promise<PracticeDeficit | null> {
  const { data, error } = await supabase
    .from(DEFICITS_TABLE)
    .select('*')
    .eq('slug', slug)
    .or(`team_id.eq.${teamId},visibility.eq.system`);
  if (error) throw error;
  const rows = ((data as unknown as RawDeficitRow[]) ?? []).map(mapDeficit);
  if (rows.length === 0) return null;
  const teamRow = rows.find((r) => r.teamId === teamId);
  return teamRow ?? rows[0] ?? null;
}

export async function createTeamDeficit(
  supabase: TypedSupabaseClient,
  teamId: string,
  createdBy: string,
  input: CreateDeficitInput,
): Promise<PracticeDeficit> {
  const parsed = createDeficitSchema.parse(input);
  const payload = {
    team_id: teamId,
    visibility: 'team',
    slug: parsed.slug,
    name: parsed.name,
    description: parsed.description ?? null,
    skill_categories: parsed.skillCategories,
    created_by: createdBy,
  };
  const { data, error } = await supabase
    .from(DEFICITS_TABLE)
    .insert(payload as never)
    .select('*')
    .single();
  if (error) throw error;
  return mapDeficit(data as unknown as RawDeficitRow);
}

export async function updateTeamDeficit(
  supabase: TypedSupabaseClient,
  deficitId: string,
  patch: UpdateDeficitInput,
): Promise<PracticeDeficit> {
  const parsed = updateDeficitSchema.parse(patch);
  const payload: Record<string, unknown> = {};
  const has = (k: keyof UpdateDeficitInput) =>
    Object.prototype.hasOwnProperty.call(parsed, k);
  if (has('slug')) payload.slug = parsed.slug;
  if (has('name')) payload.name = parsed.name;
  if (has('description')) payload.description = parsed.description ?? null;
  if (has('skillCategories')) payload.skill_categories = parsed.skillCategories;

  const { data, error } = await supabase
    .from(DEFICITS_TABLE)
    .update(payload as never)
    .eq('id', deficitId)
    .select('*')
    .single();
  if (error) throw error;
  return mapDeficit(data as unknown as RawDeficitRow);
}

export async function deleteTeamDeficit(
  supabase: TypedSupabaseClient,
  deficitId: string,
): Promise<void> {
  const { error } = await supabase.from(DEFICITS_TABLE).delete().eq('id', deficitId);
  if (error) throw error;
}

/** Returns system + team-scoped tags on the drill, hydrated with the deficit row. */
export async function listDrillDeficitTags(
  supabase: TypedSupabaseClient,
  drillId: string,
  teamId: string,
): Promise<DrillDeficitTagHydrated[]> {
  const { data, error } = await supabase
    .from(TAGS_TABLE)
    .select('*, deficit:practice_deficits(*)')
    .eq('drill_id', drillId)
    .or(`team_id.is.null,team_id.eq.${teamId}`);
  if (error) throw error;

  interface Joined extends RawTagRow {
    deficit: RawDeficitRow;
  }
  const rows = (data as unknown as Joined[]) ?? [];
  return rows.map((r) => ({
    tagId: r.id,
    deficit: mapDeficit(r.deficit),
    priority: r.priority as PracticeDrillDeficitPriority,
    tagScope: r.team_id === null ? 'system' : 'team',
  }));
}

export async function upsertDrillDeficitTag(
  supabase: TypedSupabaseClient,
  input: {
    drillId: string;
    deficitId: string;
    teamId: string;
    priority: PracticeDrillDeficitPriority;
    createdBy: string;
  },
): Promise<PracticeDrillDeficitTag> {
  const payload = {
    drill_id: input.drillId,
    deficit_id: input.deficitId,
    team_id: input.teamId,
    priority: input.priority,
    created_by: input.createdBy,
  };
  const { data, error } = await supabase
    .from(TAGS_TABLE)
    .upsert(payload as never, {
      onConflict: 'drill_id,deficit_id,team_id',
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapTag(data as unknown as RawTagRow);
}

export async function removeDrillDeficitTag(
  supabase: TypedSupabaseClient,
  tagId: string,
): Promise<void> {
  const { error } = await supabase.from(TAGS_TABLE).delete().eq('id', tagId);
  if (error) throw error;
}
