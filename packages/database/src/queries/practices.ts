import {
  COACH_ROLES,
  type PracticeBlock,
  type PracticeBlockPlayer,
  type PracticeBlockStatus,
  type PracticeBlockType,
  type PracticeFieldSpace,
  type PracticeRunStatus,
  type PracticeStation,
  type PracticeStationAssignment,
  type PracticeWeatherMode,
  type PracticeWithBlocks,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const PRACTICES_TABLE = 'practices' as never;
const BLOCKS_TABLE = 'practice_blocks' as never;
const BLOCK_PLAYERS_TABLE = 'practice_block_players' as never;
const STATIONS_TABLE = 'practice_stations' as never;
const STATION_ASSIGNMENTS_TABLE = 'practice_station_assignments' as never;
const TEMPLATE_BLOCKS_TABLE = 'practice_template_blocks' as never;
const TEAM_MEMBERS_TABLE = 'team_members' as never;

interface RawPracticeRow {
  id: string;
  team_id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  template_id: string | null;
  indoor_template_id: string | null;
  weather_mode: string;
  run_status: string;
  started_at: string | null;
  completed_at: string | null;
  active_block_id: string | null;
  total_planned_minutes: number;
  is_quick_practice: boolean;
  status: string;
  plan: string | null;
}

interface RawBlockRow {
  id: string;
  practice_id: string;
  position: number;
  block_type: string;
  title: string;
  planned_duration_minutes: number;
  actual_duration_minutes: number | null;
  drill_id: string | null;
  assigned_coach_id: string | null;
  field_spaces: string[];
  notes: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RawBlockPlayerRow {
  id: string;
  block_id: string;
  player_id: string;
  rotation_group: number | null;
  created_at: string;
}

interface RawStationRow {
  id: string;
  block_id: string;
  position: number;
  name: string;
  drill_id: string | null;
  coach_id: string | null;
  field_space: string | null;
  rotation_duration_minutes: number;
  rotation_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RawStationAssignmentRow {
  id: string;
  station_id: string;
  player_id: string;
  rotation_index: number;
  created_at: string;
}

function mapBlock(row: RawBlockRow): PracticeBlock {
  return {
    id: row.id,
    practiceId: row.practice_id,
    position: row.position,
    blockType: row.block_type as PracticeBlockType,
    title: row.title,
    plannedDurationMinutes: row.planned_duration_minutes,
    actualDurationMinutes: row.actual_duration_minutes ?? undefined,
    drillId: row.drill_id ?? undefined,
    assignedCoachId: row.assigned_coach_id ?? undefined,
    fieldSpaces: row.field_spaces as PracticeFieldSpace[],
    notes: row.notes ?? undefined,
    status: row.status as PracticeBlockStatus,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBlockPlayer(row: RawBlockPlayerRow): PracticeBlockPlayer {
  return {
    id: row.id,
    blockId: row.block_id,
    playerId: row.player_id,
    rotationGroup: row.rotation_group ?? undefined,
    createdAt: row.created_at,
  };
}

function mapStation(row: RawStationRow): PracticeStation {
  return {
    id: row.id,
    blockId: row.block_id,
    position: row.position,
    name: row.name,
    drillId: row.drill_id ?? undefined,
    coachId: row.coach_id ?? undefined,
    fieldSpace: (row.field_space ?? undefined) as PracticeFieldSpace | undefined,
    rotationDurationMinutes: row.rotation_duration_minutes,
    rotationCount: row.rotation_count,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStationAssignment(row: RawStationAssignmentRow): PracticeStationAssignment {
  return {
    id: row.id,
    stationId: row.station_id,
    playerId: row.player_id,
    rotationIndex: row.rotation_index,
    createdAt: row.created_at,
  };
}

export async function listPractices(
  supabase: TypedSupabaseClient,
  teamId: string,
  opts: { from?: string; to?: string; status?: string } = {},
) {
  let q = supabase
    .from(PRACTICES_TABLE)
    .select('*')
    .eq('team_id', teamId)
    .order('scheduled_at', { ascending: true });
  if (opts.from) q = q.gte('scheduled_at', opts.from);
  if (opts.to) q = q.lte('scheduled_at', opts.to);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as RawPracticeRow[]) ?? [];
}

export async function getPracticeWithBlocks(
  supabase: TypedSupabaseClient,
  practiceId: string,
): Promise<PracticeWithBlocks | null> {
  const { data: pr, error: prErr } = await supabase
    .from(PRACTICES_TABLE)
    .select('*')
    .eq('id', practiceId)
    .maybeSingle();
  if (prErr) throw prErr;
  if (!pr) return null;
  const practice = pr as unknown as RawPracticeRow;

  const { data: blockRows, error: blocksErr } = await supabase
    .from(BLOCKS_TABLE)
    .select('*')
    .eq('practice_id', practiceId)
    .order('position', { ascending: true });
  if (blocksErr) throw blocksErr;
  const blocks = ((blockRows as unknown as RawBlockRow[]) ?? []).map(mapBlock);
  const blockIds = blocks.map((b) => b.id);

  let players: PracticeBlockPlayer[] = [];
  let stations: PracticeStation[] = [];
  let stationAssignments: PracticeStationAssignment[] = [];

  if (blockIds.length > 0) {
    const [playerRes, stationRes] = await Promise.all([
      // Stable ordering so the UI renders the same way across refetches.
      supabase
        .from(BLOCK_PLAYERS_TABLE)
        .select('*')
        .in('block_id', blockIds)
        .order('created_at', { ascending: true }),
      supabase
        .from(STATIONS_TABLE)
        .select('*')
        .in('block_id', blockIds)
        .order('position', { ascending: true }),
    ]);
    if (playerRes.error) throw playerRes.error;
    if (stationRes.error) throw stationRes.error;
    players = ((playerRes.data as unknown as RawBlockPlayerRow[]) ?? []).map(mapBlockPlayer);
    stations = ((stationRes.data as unknown as RawStationRow[]) ?? []).map(mapStation);

    const stationIds = stations.map((s) => s.id);
    if (stationIds.length > 0) {
      const { data: assignRows, error: assignErr } = await supabase
        .from(STATION_ASSIGNMENTS_TABLE)
        .select('*')
        .in('station_id', stationIds)
        .order('rotation_index', { ascending: true })
        .order('created_at', { ascending: true });
      if (assignErr) throw assignErr;
      stationAssignments = ((assignRows as unknown as RawStationAssignmentRow[]) ?? []).map(
        mapStationAssignment,
      );
    }
  }

  const stationsByBlock = new Map<string, PracticeStation[]>();
  for (const s of stations) {
    const bucket = stationsByBlock.get(s.blockId) ?? [];
    bucket.push(s);
    stationsByBlock.set(s.blockId, bucket);
  }
  const assignsByStation = new Map<string, PracticeStationAssignment[]>();
  for (const a of stationAssignments) {
    const bucket = assignsByStation.get(a.stationId) ?? [];
    bucket.push(a);
    assignsByStation.set(a.stationId, bucket);
  }
  const playersByBlock = new Map<string, PracticeBlockPlayer[]>();
  for (const p of players) {
    const bucket = playersByBlock.get(p.blockId) ?? [];
    bucket.push(p);
    playersByBlock.set(p.blockId, bucket);
  }

  return {
    id: practice.id,
    teamId: practice.team_id,
    scheduledAt: practice.scheduled_at,
    durationMinutes: practice.duration_minutes ?? undefined,
    location: practice.location ?? undefined,
    templateId: practice.template_id ?? undefined,
    indoorTemplateId: practice.indoor_template_id ?? undefined,
    weatherMode: practice.weather_mode as PracticeWeatherMode,
    runStatus: practice.run_status as PracticeRunStatus,
    startedAt: practice.started_at ?? undefined,
    completedAt: practice.completed_at ?? undefined,
    activeBlockId: practice.active_block_id ?? undefined,
    totalPlannedMinutes: practice.total_planned_minutes,
    isQuickPractice: practice.is_quick_practice,
    status: practice.status,
    plan: practice.plan ?? undefined,
    blocks: blocks.map((b) => ({
      ...b,
      players: playersByBlock.get(b.id) ?? [],
      stations: (stationsByBlock.get(b.id) ?? [])
        .sort((a, c) => a.position - c.position)
        .map((station) => ({
          ...station,
          assignments: assignsByStation.get(station.id) ?? [],
        })),
    })),
  };
}

export async function instantiatePracticeFromTemplate(
  supabase: TypedSupabaseClient,
  args: { practiceId: string; templateId: string },
): Promise<void> {
  const { data: tplBlocks, error } = await supabase
    .from(TEMPLATE_BLOCKS_TABLE)
    .select('*')
    .eq('template_id', args.templateId)
    .order('position', { ascending: true });
  if (error) throw error;

  const { error: delErr } = await supabase
    .from(BLOCKS_TABLE)
    .delete()
    .eq('practice_id', args.practiceId);
  if (delErr) throw delErr;

  const rows = ((tplBlocks as unknown as { position: number; block_type: string; title: string; duration_minutes: number; drill_id: string | null; field_spaces: string[]; notes: string | null }[]) ?? []).map((b) => ({
    practice_id: args.practiceId,
    position: b.position,
    block_type: b.block_type,
    title: b.title,
    planned_duration_minutes: b.duration_minutes,
    drill_id: b.drill_id,
    field_spaces: b.field_spaces,
    notes: b.notes,
    status: 'pending',
  }));

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from(BLOCKS_TABLE).insert(rows as never);
    if (insErr) throw insErr;
  }

  const { error: updErr } = await supabase
    .from(PRACTICES_TABLE)
    .update({ template_id: args.templateId } as never)
    .eq('id', args.practiceId);
  if (updErr) throw updErr;
}

export interface UpsertBlockInput {
  id?: string;
  practiceId: string;
  position: number;
  blockType: PracticeBlockType;
  title: string;
  plannedDurationMinutes: number;
  drillId?: string | null;
  assignedCoachId?: string | null;
  fieldSpaces?: PracticeFieldSpace[];
  notes?: string;
}

export async function upsertBlock(
  supabase: TypedSupabaseClient,
  input: UpsertBlockInput,
): Promise<PracticeBlock> {
  const payload = {
    practice_id: input.practiceId,
    position: input.position,
    block_type: input.blockType,
    title: input.title,
    planned_duration_minutes: input.plannedDurationMinutes,
    drill_id: input.drillId ?? null,
    assigned_coach_id: input.assignedCoachId ?? null,
    field_spaces: input.fieldSpaces ?? [],
    notes: input.notes ?? null,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from(BLOCKS_TABLE)
      .update(payload as never)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw error;
    return mapBlock(data as unknown as RawBlockRow);
  }
  const { data, error } = await supabase
    .from(BLOCKS_TABLE)
    .insert(payload as never)
    .select('*')
    .single();
  if (error) throw error;
  return mapBlock(data as unknown as RawBlockRow);
}

export async function deleteBlock(
  supabase: TypedSupabaseClient,
  blockId: string,
): Promise<void> {
  const { error } = await supabase.from(BLOCKS_TABLE).delete().eq('id', blockId);
  if (error) throw error;
}

export async function reorderBlocks(
  supabase: TypedSupabaseClient,
  practiceId: string,
  orderedBlockIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('practice_reorder_blocks' as never, {
    p_practice_id: practiceId,
    p_order: orderedBlockIds,
  } as never);
  if (error) throw error;
}

export async function assignPlayersToBlock(
  supabase: TypedSupabaseClient,
  blockId: string,
  playerIds: string[],
): Promise<void> {
  // Dedupe to avoid tripping the (block_id, player_id) unique constraint.
  const unique = Array.from(new Set(playerIds));
  const { error: delErr } = await supabase
    .from(BLOCK_PLAYERS_TABLE)
    .delete()
    .eq('block_id', blockId);
  if (delErr) throw delErr;
  if (unique.length === 0) return;
  const rows = unique.map((playerId) => ({ block_id: blockId, player_id: playerId }));
  const { error } = await supabase.from(BLOCK_PLAYERS_TABLE).insert(rows as never);
  if (error) throw error;
}

export async function applyWeatherSwap(
  supabase: TypedSupabaseClient,
  args: {
    practiceId: string;
    targetMode: PracticeWeatherMode;
    indoorTemplateId?: string;
  },
): Promise<void> {
  const updates: Record<string, unknown> = { weather_mode: args.targetMode };
  if (args.indoorTemplateId !== undefined) updates.indoor_template_id = args.indoorTemplateId;
  const { error: prErr } = await supabase
    .from(PRACTICES_TABLE)
    .update(updates as never)
    .eq('id', args.practiceId);
  if (prErr) throw prErr;

  if (!args.indoorTemplateId) return;

  // Swap the drill_id and field_spaces of each block to the paired template's
  // block at the same position. Title and planned_duration_minutes stay the
  // same so the schedule doesn't shift.
  const { data: indoorBlocks, error: tErr } = await supabase
    .from(TEMPLATE_BLOCKS_TABLE)
    .select('position, drill_id, field_spaces')
    .eq('template_id', args.indoorTemplateId);
  if (tErr) throw tErr;

  const indoorByPos = new Map<number, { drillId: string | null; fieldSpaces: string[] }>();
  for (const row of (indoorBlocks as unknown as { position: number; drill_id: string | null; field_spaces: string[] }[]) ?? []) {
    indoorByPos.set(row.position, { drillId: row.drill_id, fieldSpaces: row.field_spaces });
  }

  const { data: currentBlocks, error: bErr } = await supabase
    .from(BLOCKS_TABLE)
    .select('id, position')
    .eq('practice_id', args.practiceId);
  if (bErr) throw bErr;

  for (const row of (currentBlocks as unknown as { id: string; position: number }[]) ?? []) {
    const swap = indoorByPos.get(row.position);
    if (!swap) continue;
    const { error: uErr } = await supabase
      .from(BLOCKS_TABLE)
      .update({ drill_id: swap.drillId, field_spaces: swap.fieldSpaces } as never)
      .eq('id', row.id);
    if (uErr) throw uErr;
  }
}

export async function persistCompressedBlocks(
  supabase: TypedSupabaseClient,
  updates: Array<{ id: string; plannedDurationMinutes: number }>,
): Promise<void> {
  if (updates.length === 0) return;
  // Single round-trip bulk upsert (onConflict=id) rather than N updates in
  // a loop — the prior loop could partially commit on error.
  const payload = updates.map((u) => ({
    id: u.id,
    planned_duration_minutes: u.plannedDurationMinutes,
  }));
  const { error } = await supabase
    .from(BLOCKS_TABLE)
    .upsert(payload as never, { onConflict: 'id' });
  if (error) throw error;
}

// First-writer-wins: guard with .is('started_at', null) so a second writer
// (e.g. phone + web at the same time) is silently ignored. The caller can
// inspect the returned boolean to detect that "silent" case and rerender.
export async function startBlock(
  supabase: TypedSupabaseClient,
  blockId: string,
  startedAt: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(BLOCKS_TABLE)
    .update({ started_at: startedAt, status: 'active' } as never)
    .eq('id', blockId)
    .is('started_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function completeBlock(
  supabase: TypedSupabaseClient,
  blockId: string,
  completedAt: string,
  actualDurationMinutes: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(BLOCKS_TABLE)
    .update({
      completed_at: completedAt,
      actual_duration_minutes: actualDurationMinutes,
      status: 'completed',
    } as never)
    .eq('id', blockId)
    .is('completed_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

// Terminal-state guard: refuse to overwrite a completed block with a late
// skip. Previously a delayed "skip" could clobber actual_duration_minutes.
export async function skipBlock(
  supabase: TypedSupabaseClient,
  blockId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(BLOCKS_TABLE)
    .update({ status: 'skipped' } as never)
    .eq('id', blockId)
    .is('completed_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function markPracticeStarted(
  supabase: TypedSupabaseClient,
  practiceId: string,
  startedAt: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(PRACTICES_TABLE)
    .update({ started_at: startedAt, run_status: 'running' } as never)
    .eq('id', practiceId)
    .is('started_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function markPracticeCompleted(
  supabase: TypedSupabaseClient,
  practiceId: string,
  completedAt: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(PRACTICES_TABLE)
    .update({ completed_at: completedAt, run_status: 'completed' } as never)
    .eq('id', practiceId)
    .is('completed_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export interface TeamCoach {
  userId: string;
  role: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

interface RawTeamCoachRow {
  user_id: string;
  role: string;
  user_profiles: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

/**
 * List active coaches on a team, joined to their user_profiles for display.
 * Used by the block-owner dropdown in the practice plan editor.
 */
export async function listTeamCoaches(
  supabase: TypedSupabaseClient,
  teamId: string,
): Promise<TeamCoach[]> {
  const { data, error } = await supabase
    .from(TEAM_MEMBERS_TABLE)
    .select('user_id, role, user_profiles(first_name, last_name)')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .in('role', COACH_ROLES as unknown as string[]);
  if (error) throw error;
  const rows = (data as unknown as RawTeamCoachRow[]) ?? [];
  return rows
    .map((r) => {
      const first = r.user_profiles?.first_name?.trim() ?? '';
      const last = r.user_profiles?.last_name?.trim() ?? '';
      const display = `${first} ${last}`.trim() || 'Unnamed coach';
      return {
        userId: r.user_id,
        role: r.role,
        firstName: first,
        lastName: last,
        displayName: display,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function setActiveBlock(
  supabase: TypedSupabaseClient,
  practiceId: string,
  blockId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from(PRACTICES_TABLE)
    .update({ active_block_id: blockId } as never)
    .eq('id', practiceId);
  if (error) throw error;
}
