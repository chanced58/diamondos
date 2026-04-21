import { filterDrills } from '@baseball/shared';
import type {
  DrillFilters,
  PracticeDrill,
  PracticeDrillAttachment,
  PracticeDrillAttachmentKind,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

/**
 * NOTE: The generated Database type (types/supabase.ts) does not yet include
 * the practice_drills / practice_drill_attachments tables — it will after
 * `supabase db reset && pnpm --filter @baseball/database gen-types` runs. Until
 * then, the few `as never` casts inside `.from(...)` are the minimum necessary
 * escape to keep the rest of the query helper fully typed against the shared
 * domain types. Remove the casts when types are regenerated.
 */

const DRILLS_TABLE = 'practice_drills' as never;
const ATTACHMENTS_TABLE = 'practice_drill_attachments' as never;

interface RawDrillRow {
  id: string;
  team_id: string | null;
  visibility: 'system' | 'team';
  name: string;
  description: string | null;
  default_duration_minutes: number | null;
  skill_categories: string[];
  positions: string[];
  age_levels: string[];
  equipment: string[];
  field_spaces: string[];
  min_players: number | null;
  max_players: number | null;
  coaching_points: string | null;
  tags: string[];
  diagram_url: string | null;
  video_url: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapDrill(row: RawDrillRow): PracticeDrill {
  return {
    id: row.id,
    teamId: row.team_id,
    visibility: row.visibility as PracticeDrill['visibility'],
    name: row.name,
    description: row.description ?? undefined,
    defaultDurationMinutes: row.default_duration_minutes ?? undefined,
    skillCategories: row.skill_categories as PracticeDrill['skillCategories'],
    positions: row.positions ?? [],
    ageLevels: row.age_levels as PracticeDrill['ageLevels'],
    equipment: row.equipment as PracticeDrill['equipment'],
    fieldSpaces: row.field_spaces as PracticeDrill['fieldSpaces'],
    minPlayers: row.min_players ?? undefined,
    maxPlayers: row.max_players ?? undefined,
    coachingPoints: row.coaching_points ?? undefined,
    tags: row.tags ?? [],
    diagramUrl: row.diagram_url ?? undefined,
    videoUrl: row.video_url ?? undefined,
    source: row.source ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RawAttachment {
  id: string;
  drill_id: string;
  storage_path: string;
  mime_type: string;
  kind: PracticeDrillAttachmentKind;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

function mapAttachment(row: RawAttachment): PracticeDrillAttachment {
  return {
    id: row.id,
    drillId: row.drill_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    kind: row.kind,
    sizeBytes: row.size_bytes ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listDrills(
  supabase: TypedSupabaseClient,
  teamId: string,
  filters: DrillFilters = {},
): Promise<PracticeDrill[]> {
  const { data, error } = await supabase
    .from(DRILLS_TABLE)
    .select('*')
    .or(`team_id.eq.${teamId},visibility.eq.system`)
    .order('name', { ascending: true });

  if (error) throw error;
  const rows = (data as unknown as RawDrillRow[]) ?? [];
  const mapped = rows.map(mapDrill);
  return applyClientFilters(mapped, filters);
}

export async function getDrillById(
  supabase: TypedSupabaseClient,
  drillId: string,
): Promise<PracticeDrill | null> {
  const { data, error } = await supabase
    .from(DRILLS_TABLE)
    .select('*')
    .eq('id', drillId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapDrill(data as unknown as RawDrillRow);
}

export interface CreateDrillInsert {
  teamId: string;
  name: string;
  description?: string;
  defaultDurationMinutes?: number;
  skillCategories: string[];
  positions?: string[];
  ageLevels?: string[];
  equipment?: string[];
  fieldSpaces?: string[];
  minPlayers?: number;
  maxPlayers?: number;
  coachingPoints?: string;
  tags?: string[];
  diagramUrl?: string;
  videoUrl?: string;
  createdBy: string;
}

export async function createDrill(
  supabase: TypedSupabaseClient,
  input: CreateDrillInsert,
): Promise<PracticeDrill> {
  const payload = {
    team_id: input.teamId,
    visibility: 'team',
    name: input.name,
    description: input.description ?? null,
    default_duration_minutes: input.defaultDurationMinutes ?? null,
    skill_categories: input.skillCategories,
    positions: input.positions ?? [],
    age_levels: input.ageLevels ?? ['all'],
    equipment: input.equipment ?? [],
    field_spaces: input.fieldSpaces ?? [],
    min_players: input.minPlayers ?? null,
    max_players: input.maxPlayers ?? null,
    coaching_points: input.coachingPoints ?? null,
    tags: input.tags ?? [],
    diagram_url: input.diagramUrl ?? null,
    video_url: input.videoUrl ?? null,
    created_by: input.createdBy,
  };

  const { data, error } = await supabase
    .from(DRILLS_TABLE)
    .insert(payload as never)
    .select('*')
    .single();

  if (error) throw error;
  return mapDrill(data as unknown as RawDrillRow);
}

export type UpdateDrillPatch = Partial<Omit<CreateDrillInsert, 'teamId' | 'createdBy'>>;

export async function updateDrill(
  supabase: TypedSupabaseClient,
  drillId: string,
  patch: UpdateDrillPatch,
): Promise<PracticeDrill> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.defaultDurationMinutes !== undefined) payload.default_duration_minutes = patch.defaultDurationMinutes;
  if (patch.skillCategories !== undefined) payload.skill_categories = patch.skillCategories;
  if (patch.positions !== undefined) payload.positions = patch.positions;
  if (patch.ageLevels !== undefined) payload.age_levels = patch.ageLevels;
  if (patch.equipment !== undefined) payload.equipment = patch.equipment;
  if (patch.fieldSpaces !== undefined) payload.field_spaces = patch.fieldSpaces;
  if (patch.minPlayers !== undefined) payload.min_players = patch.minPlayers;
  if (patch.maxPlayers !== undefined) payload.max_players = patch.maxPlayers;
  if (patch.coachingPoints !== undefined) payload.coaching_points = patch.coachingPoints;
  if (patch.tags !== undefined) payload.tags = patch.tags;
  if (patch.diagramUrl !== undefined) payload.diagram_url = patch.diagramUrl;
  if (patch.videoUrl !== undefined) payload.video_url = patch.videoUrl;

  const { data, error } = await supabase
    .from(DRILLS_TABLE)
    .update(payload as never)
    .eq('id', drillId)
    .select('*')
    .single();

  if (error) throw error;
  return mapDrill(data as unknown as RawDrillRow);
}

export async function deleteDrill(
  supabase: TypedSupabaseClient,
  drillId: string,
): Promise<void> {
  const { error } = await supabase.from(DRILLS_TABLE).delete().eq('id', drillId);
  if (error) throw error;
}

export async function listDrillAttachments(
  supabase: TypedSupabaseClient,
  drillId: string,
): Promise<PracticeDrillAttachment[]> {
  const { data, error } = await supabase
    .from(ATTACHMENTS_TABLE)
    .select('*')
    .eq('drill_id', drillId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as unknown as RawAttachment[]) ?? []).map(mapAttachment);
}

export async function createDrillAttachment(
  supabase: TypedSupabaseClient,
  input: {
    drillId: string;
    storagePath: string;
    mimeType: string;
    kind: PracticeDrillAttachmentKind;
    sizeBytes?: number;
    uploadedBy: string;
  },
): Promise<PracticeDrillAttachment> {
  const payload = {
    drill_id: input.drillId,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    kind: input.kind,
    size_bytes: input.sizeBytes ?? null,
    uploaded_by: input.uploadedBy,
  };
  const { data, error } = await supabase
    .from(ATTACHMENTS_TABLE)
    .insert(payload as never)
    .select('*')
    .single();
  if (error) throw error;
  return mapAttachment(data as unknown as RawAttachment);
}

export async function deleteDrillAttachment(
  supabase: TypedSupabaseClient,
  attachmentId: string,
): Promise<void> {
  const { error } = await supabase
    .from(ATTACHMENTS_TABLE)
    .delete()
    .eq('id', attachmentId);
  if (error) throw error;
}

/**
 * Creates a signed URL for a private storage object. Default 1-hour TTL.
 */
export async function getDrillAttachmentSignedUrl(
  supabase: TypedSupabaseClient,
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('drill-attachments')
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('No signed URL returned');
  return data.signedUrl;
}

// ─── local filtering ─────────────────────────────────────────────────────────
// Most filters could be pushed to Postgres GIN queries, but for MVP we keep
// filtering client-side to avoid building a complex .or() chain. The drill
// catalog is small (~120 system + team) so the cost is negligible.

function applyClientFilters(
  drills: PracticeDrill[],
  filters: DrillFilters,
): PracticeDrill[] {
  if (!filters || Object.keys(filters).length === 0) return drills;
  return filterDrills(drills, filters);
}
