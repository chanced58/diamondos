import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceError, serviceOk, type ServiceResult } from '../result';

export interface LeagueStaffAccess {
  league: { id: string; name: string };
  role: 'league_admin' | 'league_manager';
  isLeagueAdmin: boolean;
}

/**
 * The actor's active league staff seat, as `getLeagueAccess` reads it for the
 * web /league/admin pages: staff (admins and managers) read, and with
 * `requireAdmin` only league admins pass. Someone with no seat gets not_found,
 * so a league's existence isn't revealed.
 */
export async function authorizeLeagueStaff(
  db: SupabaseClient,
  actorUserId: string,
  leagueId: string,
  options: { requireAdmin: boolean; forbiddenMessage?: string },
): Promise<ServiceResult<LeagueStaffAccess>> {
  const { data, error } = await db
    .from('league_staff')
    .select('role, leagues(id, name)')
    .eq('league_id', leagueId)
    .eq('user_id', actorUserId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.error(`[league-admin] authorizeLeagueStaff failed league=${leagueId} actor=${actorUserId}:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
  const row = data as { role: string; leagues: { id: string; name: string } | { id: string; name: string }[] | null } | null;
  const league = Array.isArray(row?.leagues) ? row?.leagues[0] : row?.leagues;
  if (!row || !league || (row.role !== 'league_admin' && row.role !== 'league_manager')) {
    return serviceError('not_found', 'League not found.');
  }
  const isLeagueAdmin = row.role === 'league_admin';
  if (options.requireAdmin && !isLeagueAdmin) {
    return serviceError('forbidden', options.forbiddenMessage ?? 'Only league admins can do that.');
  }
  return serviceOk({ league: { id: league.id, name: league.name }, role: row.role, isLeagueAdmin });
}
