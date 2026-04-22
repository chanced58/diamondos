import type { PracticeAttendance, PracticeAttendanceStatus } from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const TABLE = 'practice_attendance' as never;

interface RawAttendanceRow {
  id: string;
  practice_id: string;
  player_id: string;
  status: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: RawAttendanceRow): PracticeAttendance {
  return {
    id: row.id,
    practiceId: row.practice_id,
    playerId: row.player_id,
    status: row.status as PracticeAttendanceStatus,
    checkedInAt: row.checked_in_at,
    checkedInBy: row.checked_in_by,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPracticeAttendance(
  client: TypedSupabaseClient,
  practiceId: string,
): Promise<PracticeAttendance[]> {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('practice_id', practiceId);
  if (error) throw error;
  return ((data ?? []) as unknown as RawAttendanceRow[]).map(mapRow);
}

export interface UpsertAttendanceArgs {
  practiceId: string;
  playerId: string;
  status: PracticeAttendanceStatus;
  notes?: string | null;
  checkedInBy: string;
}

export async function upsertPracticeAttendance(
  client: TypedSupabaseClient,
  args: UpsertAttendanceArgs,
): Promise<PracticeAttendance> {
  const checkedInAt =
    args.status === 'present' || args.status === 'late' ? new Date().toISOString() : null;

  const { data, error } = await client
    .from(TABLE)
    .upsert(
      {
        practice_id: args.practiceId,
        player_id: args.playerId,
        status: args.status,
        notes: args.notes ?? null,
        checked_in_at: checkedInAt,
        checked_in_by: args.checkedInBy,
      } as never,
      { onConflict: 'practice_id,player_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data as unknown as RawAttendanceRow);
}
