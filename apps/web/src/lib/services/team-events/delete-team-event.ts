import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { isActiveTeamCoach } from '../games/game-form-helpers';

const inputSchema = z.object({ eventId: z.string().uuid('Missing event ID.') });

/** Deletes a team event. Only the team's active coaches may. */
export async function deleteTeamEvent(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ eventId: string }>> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { eventId } = parsed.data;

  const { data: event, error: lookupError } = await db
    .from('team_events')
    .select('team_id')
    .eq('id', eventId)
    .maybeSingle();
  // A failed lookup is a server fault, not a missing event.
  if (lookupError) {
    console.error(`[deleteTeamEvent] event=${eventId} actor=${actorUserId} lookup failed:`, lookupError);
    return serviceError('failed', `Failed to load event: ${lookupError.message}`);
  }
  if (!event) return serviceError('not_found', 'Event not found.');

  if (!(await isActiveTeamCoach(db, actorUserId, event.team_id as string))) {
    return serviceError('forbidden', 'Only coaches can delete events.');
  }

  const { error } = await db.from('team_events').delete().eq('id', eventId).eq('team_id', event.team_id);
  if (error) {
    console.error(`[deleteTeamEvent] event=${eventId} actor=${actorUserId} delete failed:`, error);
    return serviceError('failed', `Failed to delete event: ${error.message}`);
  }
  return serviceOk({ eventId });
}
