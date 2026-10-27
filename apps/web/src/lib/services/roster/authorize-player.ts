import type { SupabaseClient } from '@supabase/supabase-js';
import { getRosterAccess } from '@/lib/roster-access';
import { serviceError, serviceOk, type ServiceResult } from '../result';

export interface ManagedPlayer {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
}

/**
 * The player, if the actor manages their team's roster and they are on it.
 * Someone who can't see the roster gets not_found; a viewer who can't manage
 * it gets forbidden with `forbiddenMessage`.
 */
export async function authorizeManagedPlayer(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
  playerId: string,
  forbiddenMessage: string,
): Promise<ServiceResult<ManagedPlayer>> {
  const access = await getRosterAccess(db, teamId, actorUserId);
  if (!access.canView) return serviceError('not_found', 'Player not found.');
  if (!access.canManage) return serviceError('forbidden', forbiddenMessage);

  const { data, error } = await db
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (error) {
    console.error(`[roster] authorizeManagedPlayer failed player=${playerId} actor=${actorUserId}:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
  if (!data) return serviceError('not_found', 'Player not found.');
  return serviceOk(data as ManagedPlayer);
}
