import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceError, serviceOk, type ServiceResult } from '../result';

export interface NewGameEvent {
  event_type: string;
  inning: number;
  is_top_of_inning: boolean;
  payload: Record<string, unknown>;
}

const MAX_ATTEMPTS = 3;
const UNIQUE_VIOLATION = '23505';

/**
 * Appends events to a game's log in one insert, numbered after the current
 * highest sequence. A scorer writing at the same moment can take the same
 * numbers (unique(game_id, sequence_number)), so a collision re-reads the
 * tail and retries.
 */
export async function appendGameEvents(
  db: SupabaseClient,
  args: { gameId: string; actorUserId: string; deviceId: string; events: NewGameEvent[] },
): Promise<ServiceResult<{ firstSequenceNumber: number }>> {
  const { gameId, actorUserId, deviceId, events } = args;
  const occurredAt = new Date().toISOString();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data: last, error: readError } = await db
      .from('game_events')
      .select('sequence_number')
      .eq('game_id', gameId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) {
      console.error(`[appendGameEvents] game=${gameId} actor=${actorUserId} tail read failed:`, readError);
      return serviceError('failed', `Failed to save the correction: ${readError.message}`);
    }

    const firstSequenceNumber = ((last?.sequence_number as number | undefined) ?? 0) + 1;
    const { error } = await db.from('game_events').insert(
      events.map((event, index) => ({
        ...event,
        game_id: gameId,
        sequence_number: firstSequenceNumber + index,
        occurred_at: occurredAt,
        created_by: actorUserId,
        device_id: deviceId,
      })),
    );
    if (!error) return serviceOk({ firstSequenceNumber });
    if (error.code !== UNIQUE_VIOLATION || attempt === MAX_ATTEMPTS) {
      console.error(`[appendGameEvents] game=${gameId} actor=${actorUserId} insert failed:`, error);
      return serviceError('failed', `Failed to save the correction: ${error.message}`);
    }
  }
  return serviceError('failed', 'Failed to save the correction.');
}
