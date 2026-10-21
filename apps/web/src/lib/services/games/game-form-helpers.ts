import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole, zonedDateTimeToUtc, type CreateGameFormData } from '@baseball/shared';
import { resolveGameTimeZone } from '@/lib/games/game-time-zone';
import { serviceError, type ServiceResult } from '../result';

/** Active head/assistant coach or athletic director of the team. */
export async function isActiveTeamCoach(db: SupabaseClient, userId: string, teamId: string): Promise<boolean> {
  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return Boolean(membership && isCoachRole(membership.role as string));
}

export async function isPlatformAdmin(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from('user_profiles').select('is_platform_admin').eq('id', userId).maybeSingle();
  return data?.is_platform_admin === true;
}

/**
 * The leagues the team is an active member of. The one source for which
 * leagues' opponents a team may schedule, shared by the availability check
 * and the form options so the form never offers an opponent the check rejects.
 */
export async function activeLeagueIds(db: SupabaseClient, teamId: string): Promise<string[]> {
  const { data: teamLeagues } = await db
    .from('league_members')
    .select('league_id')
    .eq('team_id', teamId)
    .eq('is_active', true);
  return (teamLeagues ?? []).map((row) => row.league_id as string);
}

/**
 * Whether an opponent team record may be used for one of the team's games:
 * the team owns it, or it is an active member of a league the team is also an
 * active member of.
 */
export async function isOpponentTeamAvailable(
  db: SupabaseClient,
  teamId: string,
  opponentTeamId: string,
): Promise<boolean> {
  const { data: opponentTeam } = await db
    .from('opponent_teams')
    .select('id, team_id')
    .eq('id', opponentTeamId)
    .maybeSingle();
  if (!opponentTeam) return false;
  if (opponentTeam.team_id === teamId) return true;

  const leagueIds = await activeLeagueIds(db, teamId);
  if (leagueIds.length === 0) return false;

  const { data: shared } = await db
    .from('league_members')
    .select('id')
    .eq('opponent_team_id', opponentTeamId)
    .eq('is_active', true)
    .in('league_id', leagueIds)
    .limit(1);
  return (shared ?? []).length > 0;
}

type Schedule = Pick<CreateGameFormData, 'date' | 'time' | 'venue' | 'deviceTimeZone'>;

/**
 * The game's zone and start instant from the typed date and time. The zone is
 * the venue's (from its coordinates), else the game's saved zone, else the
 * submitting device's; the server runs in UTC, so it never guesses its own.
 */
export function resolveGameSchedule(
  input: Schedule,
  existingTimeZone?: string | null,
): ServiceResult<{ timeZone: string | null; scheduledAt: string }> {
  const timeZone = resolveGameTimeZone({
    latitude: input.venue?.latitude ?? null,
    longitude: input.venue?.longitude ?? null,
    existingTimeZone,
    browserTimeZone: input.deviceTimeZone,
  });
  try {
    return { ok: true, data: { timeZone, scheduledAt: zonedDateTimeToUtc(input.date, input.time, timeZone ?? 'UTC') } };
  } catch {
    return serviceError('invalid', 'Invalid game date or time.');
  }
}

/** The venue columns a game row stores; a typed venue has no coordinates. */
export function venueColumns(venue: CreateGameFormData['venue']) {
  return {
    venue_name: venue?.name ?? null,
    address: venue?.address ?? null,
    latitude: venue?.latitude ?? null,
    longitude: venue?.longitude ?? null,
    place_id: venue?.placeId ?? null,
  };
}
