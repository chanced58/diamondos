import type { SupabaseClient } from '@supabase/supabase-js';
import type { PracticeDrill } from '@baseball/shared';

/**
 * The drills a team can use — the system library plus its own — as
 * `PracticeDrill`s, for the practice generators. Throws on a read failure.
 */
export async function loadTeamDrills(db: SupabaseClient, teamId: string): Promise<PracticeDrill[]> {
  const { data, error } = await db.from('practice_drills').select('*').or(`team_id.is.null,team_id.eq.${teamId}`);
  if (error) throw new Error(`Failed to load drills: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapDrillRow);
}

/** A `practice_drills` row as a `PracticeDrill`. */
export function mapDrillRow(r: Record<string, unknown>): PracticeDrill {
  return {
    id: r.id as string,
    teamId: (r.team_id as string | null) ?? null,
    visibility: r.visibility as PracticeDrill['visibility'],
    name: r.name as string,
    description: (r.description as string | null) ?? undefined,
    defaultDurationMinutes: (r.default_duration_minutes as number | null) ?? undefined,
    skillCategories: (r.skill_categories as PracticeDrill['skillCategories']) ?? [],
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
  };
}
