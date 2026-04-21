import type {
  PracticeBlockType,
  PracticeFieldSpace,
  PracticeSeasonPhase,
  PracticeTemplate,
  PracticeTemplateBlock,
  PracticeTemplateKind,
  PracticeTemplateWithBlocks,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const TEMPLATES_TABLE = 'practice_templates' as never;
const TEMPLATE_BLOCKS_TABLE = 'practice_template_blocks' as never;

interface RawTemplateRow {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  kind: string;
  season_phase: string;
  default_duration_minutes: number;
  is_indoor_fallback: boolean;
  paired_template_id: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RawTemplateBlockRow {
  id: string;
  template_id: string;
  position: number;
  block_type: string;
  title: string;
  duration_minutes: number;
  drill_id: string | null;
  field_spaces: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapTemplate(row: RawTemplateRow): PracticeTemplate {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    description: row.description ?? undefined,
    kind: row.kind as PracticeTemplateKind,
    seasonPhase: row.season_phase as PracticeSeasonPhase,
    defaultDurationMinutes: row.default_duration_minutes,
    isIndoorFallback: row.is_indoor_fallback,
    pairedTemplateId: row.paired_template_id ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTemplateBlock(row: RawTemplateBlockRow): PracticeTemplateBlock {
  return {
    id: row.id,
    templateId: row.template_id,
    position: row.position,
    blockType: row.block_type as PracticeBlockType,
    title: row.title,
    durationMinutes: row.duration_minutes,
    drillId: row.drill_id ?? undefined,
    fieldSpaces: row.field_spaces as PracticeFieldSpace[],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTemplates(
  supabase: TypedSupabaseClient,
  teamId: string,
  opts: { includeArchived?: boolean; kind?: string; seasonPhase?: string } = {},
): Promise<PracticeTemplate[]> {
  let query = supabase
    .from(TEMPLATES_TABLE)
    .select('*')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false });

  if (!opts.includeArchived) {
    query = query.is('archived_at', null);
  }
  if (opts.kind) query = query.eq('kind', opts.kind);
  if (opts.seasonPhase) query = query.eq('season_phase', opts.seasonPhase);

  const { data, error } = await query;
  if (error) throw error;
  return ((data as unknown as RawTemplateRow[]) ?? []).map(mapTemplate);
}

export async function getTemplateWithBlocks(
  supabase: TypedSupabaseClient,
  templateId: string,
): Promise<PracticeTemplateWithBlocks | null> {
  const { data: tpl, error: tplErr } = await supabase
    .from(TEMPLATES_TABLE)
    .select('*')
    .eq('id', templateId)
    .maybeSingle();
  if (tplErr) throw tplErr;
  if (!tpl) return null;

  const { data: blockRows, error: blockErr } = await supabase
    .from(TEMPLATE_BLOCKS_TABLE)
    .select('*')
    .eq('template_id', templateId)
    .order('position', { ascending: true });
  if (blockErr) throw blockErr;

  return {
    ...mapTemplate(tpl as unknown as RawTemplateRow),
    blocks: ((blockRows as unknown as RawTemplateBlockRow[]) ?? []).map(mapTemplateBlock),
  };
}

export interface CreateTemplateInsert {
  teamId: string;
  name: string;
  description?: string;
  kind: PracticeTemplateKind;
  seasonPhase: PracticeSeasonPhase;
  defaultDurationMinutes: number;
  isIndoorFallback?: boolean;
  pairedTemplateId?: string;
  createdBy: string;
}

export interface TemplateBlockInput {
  position: number;
  blockType: PracticeBlockType;
  title: string;
  durationMinutes: number;
  drillId?: string;
  fieldSpaces?: PracticeFieldSpace[];
  notes?: string;
}

export async function createTemplateWithBlocks(
  supabase: TypedSupabaseClient,
  input: { template: CreateTemplateInsert; blocks: TemplateBlockInput[] },
): Promise<PracticeTemplateWithBlocks> {
  const tplPayload = {
    team_id: input.template.teamId,
    name: input.template.name,
    description: input.template.description ?? null,
    kind: input.template.kind,
    season_phase: input.template.seasonPhase,
    default_duration_minutes: input.template.defaultDurationMinutes,
    is_indoor_fallback: input.template.isIndoorFallback ?? false,
    paired_template_id: input.template.pairedTemplateId ?? null,
    created_by: input.template.createdBy,
  };
  const { data: tplRow, error: tplErr } = await supabase
    .from(TEMPLATES_TABLE)
    .insert(tplPayload as never)
    .select('*')
    .single();
  if (tplErr) throw tplErr;

  const template = mapTemplate(tplRow as unknown as RawTemplateRow);
  const blockPayloads = input.blocks.map((b) => ({
    template_id: template.id,
    position: b.position,
    block_type: b.blockType,
    title: b.title,
    duration_minutes: b.durationMinutes,
    drill_id: b.drillId ?? null,
    field_spaces: b.fieldSpaces ?? [],
    notes: b.notes ?? null,
  }));
  const { data: blockRows, error: blocksErr } = await supabase
    .from(TEMPLATE_BLOCKS_TABLE)
    .insert(blockPayloads as never)
    .select('*');
  if (blocksErr) throw blocksErr;

  return {
    ...template,
    blocks: ((blockRows as unknown as RawTemplateBlockRow[]) ?? [])
      .sort((a, b) => a.position - b.position)
      .map(mapTemplateBlock),
  };
}

export async function updateTemplate(
  supabase: TypedSupabaseClient,
  templateId: string,
  patch: Partial<Omit<CreateTemplateInsert, 'teamId' | 'createdBy'>>,
): Promise<PracticeTemplate> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.kind !== undefined) payload.kind = patch.kind;
  if (patch.seasonPhase !== undefined) payload.season_phase = patch.seasonPhase;
  if (patch.defaultDurationMinutes !== undefined) payload.default_duration_minutes = patch.defaultDurationMinutes;
  if (patch.isIndoorFallback !== undefined) payload.is_indoor_fallback = patch.isIndoorFallback;
  if (patch.pairedTemplateId !== undefined) payload.paired_template_id = patch.pairedTemplateId ?? null;

  const { data, error } = await supabase
    .from(TEMPLATES_TABLE)
    .update(payload as never)
    .eq('id', templateId)
    .select('*')
    .single();
  if (error) throw error;
  return mapTemplate(data as unknown as RawTemplateRow);
}

export async function replaceTemplateBlocks(
  supabase: TypedSupabaseClient,
  templateId: string,
  blocks: TemplateBlockInput[],
): Promise<PracticeTemplateBlock[]> {
  // Delete existing, then bulk-insert. The UPDATE-in-place with reordered
  // positions would violate the unique constraint mid-transaction if we
  // didn't use the deferrable index; delete-then-insert is simpler and the
  // table is small.
  const { error: delErr } = await supabase
    .from(TEMPLATE_BLOCKS_TABLE)
    .delete()
    .eq('template_id', templateId);
  if (delErr) throw delErr;

  if (blocks.length === 0) return [];

  const payload = blocks.map((b) => ({
    template_id: templateId,
    position: b.position,
    block_type: b.blockType,
    title: b.title,
    duration_minutes: b.durationMinutes,
    drill_id: b.drillId ?? null,
    field_spaces: b.fieldSpaces ?? [],
    notes: b.notes ?? null,
  }));
  const { data, error } = await supabase
    .from(TEMPLATE_BLOCKS_TABLE)
    .insert(payload as never)
    .select('*');
  if (error) throw error;
  return ((data as unknown as RawTemplateBlockRow[]) ?? [])
    .sort((a, b) => a.position - b.position)
    .map(mapTemplateBlock);
}

export async function duplicateTemplate(
  supabase: TypedSupabaseClient,
  sourceTemplateId: string,
  newName: string,
  createdBy: string,
): Promise<PracticeTemplateWithBlocks> {
  const source = await getTemplateWithBlocks(supabase, sourceTemplateId);
  if (!source) throw new Error('Source template not found');

  return createTemplateWithBlocks(supabase, {
    template: {
      teamId: source.teamId,
      name: newName,
      description: source.description,
      kind: source.kind,
      seasonPhase: source.seasonPhase,
      defaultDurationMinutes: source.defaultDurationMinutes,
      isIndoorFallback: source.isIndoorFallback,
      pairedTemplateId: source.pairedTemplateId,
      createdBy,
    },
    blocks: source.blocks.map((b) => ({
      position: b.position,
      blockType: b.blockType,
      title: b.title,
      durationMinutes: b.durationMinutes,
      drillId: b.drillId,
      fieldSpaces: b.fieldSpaces,
      notes: b.notes,
    })),
  });
}

export async function archiveTemplate(
  supabase: TypedSupabaseClient,
  templateId: string,
  archive = true,
): Promise<void> {
  const { error } = await supabase
    .from(TEMPLATES_TABLE)
    .update({ archived_at: archive ? new Date().toISOString() : null } as never)
    .eq('id', templateId);
  if (error) throw error;
}
