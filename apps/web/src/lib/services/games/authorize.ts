import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole } from '@baseball/shared';
import { getAuthorizedCoach } from '@/lib/games/finalize';
import { serviceError, type ServiceResult } from '../result';

export interface GameViewer {
  /** Coaching staff on the team, or a platform admin. */
  isCoach: boolean;
  /** The viewer's team role; null for a platform admin with no seat. */
  role: string | null;
}

/**
 * Who may see a game's pages: platform admins and active members of its team.
 * Null for anyone else — callers answer `not_found` so a game id doesn't
 * reveal that the game exists.
 */
export async function resolveGameViewer(
  db: SupabaseClient,
  userId: string,
  teamId: string,
): Promise<GameViewer | null> {
  const [{ data: profile }, { data: membership }] = await Promise.all([
    db.from('user_profiles').select('is_platform_admin').eq('id', userId).maybeSingle(),
    db
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  const role = (membership?.role as string | undefined) ?? null;
  if (profile?.is_platform_admin) return { isCoach: true, role };
  if (!role) return null;
  return { isCoach: isCoachRole(role), role };
}

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
