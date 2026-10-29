import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueStaff } from '@baseball/database';
import {
  LEAGUE_STAFF_ROLES,
  leagueAdminInputSchema,
  leagueStaffIdInputSchema,
  type LeagueStaffMember,
  type LeagueStaffResponse,
  type LeagueStaffRole,
  type LeagueStaffWriteResponse,
} from '@baseball/shared';
import { authorizeLeagueStaff } from './authorize';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * A league's staff (the League Staff card of the web /league/admin page),
 * shared by its remove action and the mobile
 * `/api/m/v1/league-admin/:leagueId/staff` routes. League admins only, as the
 * web shows the card to admins and RLS lets only them delete a seat. An admin
 * never removes their own seat, so a league always keeps the admin acting on
 * it. Inviting staff stays on the web.
 */

const STAFF_ADMIN_ONLY = 'Only league admins can manage the league’s staff.';

function failed<T>(action: string, leagueId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[league-staff] ${action} failed league=${leagueId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

type Profile = { first_name: string | null; last_name: string | null; email: string | null };

function staffName(profile: Profile | null): string {
  if (!profile) return 'Unknown';
  return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || profile.email || 'Unknown';
}

function isStaffRole(role: string): role is LeagueStaffRole {
  return (LEAGUE_STAFF_ROLES as readonly string[]).includes(role);
}

export async function loadLeagueStaff(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueStaffResponse>> {
  const parsed = leagueAdminInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: true, forbiddenMessage: STAFF_ADMIN_ONLY });
  if (!access.ok) return access;

  try {
    const rows = await getLeagueStaff(db, leagueId);
    const staff: LeagueStaffMember[] = rows.flatMap((row) => {
      if (!isStaffRole(row.role)) return [];
      const profile = (Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles) as Profile | null | undefined;
      return [
        {
          staffId: row.id,
          userId: row.user_id,
          role: row.role,
          name: staffName(profile ?? null),
          email: profile?.email ?? null,
          isYou: row.user_id === actorUserId,
        },
      ];
    });
    staff.sort((a, b) => LEAGUE_STAFF_ROLES.indexOf(a.role) - LEAGUE_STAFF_ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
    return serviceOk({ league: access.data.league, staff });
  } catch (error) {
    return failed('loadLeagueStaff', leagueId, actorUserId, error);
  }
}

/** Takes someone off the league's staff for good; they can be invited again from the web. */
export async function removeLeagueStaff(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueStaffWriteResponse>> {
  const parsed = leagueStaffIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, staffId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: true, forbiddenMessage: STAFF_ADMIN_ONLY });
  if (!access.ok) return access;

  const { data: seat, error: seatError } = await db
    .from('league_staff')
    .select('id, user_id')
    .eq('id', staffId)
    .eq('league_id', leagueId)
    .maybeSingle();
  if (seatError) return failed('removeLeagueStaff', leagueId, actorUserId, seatError);
  if (!seat) return serviceError('not_found', 'Staff member not found.');
  if ((seat as { user_id: string }).user_id === actorUserId) {
    return serviceError('conflict', 'You can’t remove yourself from the league’s staff.');
  }

  const { data, error } = await db.from('league_staff').delete().eq('id', staffId).eq('league_id', leagueId).select('id');
  if (error) return failed('removeLeagueStaff', leagueId, actorUserId, error);
  if (!data || (data as unknown[]).length === 0) return serviceError('not_found', 'Staff member not found.');
  return serviceOk({ staffId });
}
