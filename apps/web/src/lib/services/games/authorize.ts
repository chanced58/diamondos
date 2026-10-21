import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthorizedCoach } from '@/lib/games/finalize';
import { serviceError, type ServiceResult } from '../result';

type AuthorizedGame = Extract<Awaited<ReturnType<typeof getAuthorizedCoach>>, { game: unknown }>['game'];

/**
 * `getAuthorizedCoach` (platform admin, or an active head/assistant coach or
 * athletic director on the game's team) as a service result, so every coach
 * game action authorizes the same way on web and mobile.
 */
export async function authorizeGameCoach(
  db: SupabaseClient,
  actorUserId: string,
  gameId: string,
): Promise<ServiceResult<AuthorizedGame>> {
  const result = await getAuthorizedCoach(db, actorUserId, gameId);
  if (!result.game) {
    return serviceError(result.code ?? 'forbidden', result.error ?? 'Only coaches can perform this action.');
  }
  return { ok: true, data: result.game };
}
