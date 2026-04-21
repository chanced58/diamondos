import type { PracticeFieldSpace } from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const STATIONS_TABLE = 'practice_stations' as never;
const ASSIGNMENTS_TABLE = 'practice_station_assignments' as never;

export interface StationInput {
  id?: string;
  position: number;
  name: string;
  drillId?: string | null;
  coachId?: string | null;
  fieldSpace?: PracticeFieldSpace | null;
  rotationDurationMinutes: number;
  rotationCount: number;
  notes?: string;
}

export async function replaceStationsForBlock(
  supabase: TypedSupabaseClient,
  blockId: string,
  stations: StationInput[],
): Promise<void> {
  // Delete old stations (cascade wipes assignments). Then bulk-insert new.
  const { error: delErr } = await supabase
    .from(STATIONS_TABLE)
    .delete()
    .eq('block_id', blockId);
  if (delErr) throw delErr;
  if (stations.length === 0) return;

  const payload = stations.map((s) => ({
    block_id: blockId,
    position: s.position,
    name: s.name,
    drill_id: s.drillId ?? null,
    coach_id: s.coachId ?? null,
    field_space: s.fieldSpace ?? null,
    rotation_duration_minutes: s.rotationDurationMinutes,
    rotation_count: s.rotationCount,
    notes: s.notes ?? null,
  }));
  const { error } = await supabase.from(STATIONS_TABLE).insert(payload as never);
  if (error) throw error;
}

export async function writeStationAssignments(
  supabase: TypedSupabaseClient,
  assignments: Array<{ stationId: string; playerId: string; rotationIndex: number }>,
): Promise<void> {
  if (assignments.length === 0) return;
  const stationIds = Array.from(new Set(assignments.map((a) => a.stationId)));
  const { error: delErr } = await supabase
    .from(ASSIGNMENTS_TABLE)
    .delete()
    .in('station_id', stationIds);
  if (delErr) throw delErr;

  const payload = assignments.map((a) => ({
    station_id: a.stationId,
    player_id: a.playerId,
    rotation_index: a.rotationIndex,
  }));
  const { error } = await supabase.from(ASSIGNMENTS_TABLE).insert(payload as never);
  if (error) throw error;
}
