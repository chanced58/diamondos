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

/** A failed lookup as a `failed` result, logged with its context. */
function lookupFailed<T>(what: string, context: string, error: { message: string }): ServiceResult<T> {
  console.error(`[game-form] ${what} lookup failed ${context}:`, error);
  return serviceError('failed', `Failed to load ${what}: ${error.message}`);
}

/**
 * The leagues the team is an active member of. The one source for which
 * leagues' opponents a team may schedule, shared by the availability check
 * and the form options so the form never offers an opponent the check rejects.
 * A failed query is a `failed` result, never an empty list: "no leagues" would
 * silently drop league opponents and reject valid ones.
 */
export async function activeLeagueIds(db: SupabaseClient, teamId: string): Promise<ServiceResult<string[]>> {
  const { data: teamLeagues, error } = await db
    .from('league_members')
    .select('league_id')
    .eq('team_id', teamId)
    .eq('is_active', true);
  if (error) return lookupFailed('team leagues', `team=${teamId}`, error);
  return { ok: true, data: (teamLeagues ?? []).map((row) => row.league_id as string) };
}

/**
 * Whether an opponent team record may be used for one of the team's games:
 * the team owns it, or it is an active member of a league the team is also an
 * active member of. Lookup failures come back as `failed`, not as "no".
 */
export async function isOpponentTeamAvailable(
  db: SupabaseClient,
  teamId: string,
  opponentTeamId: string,
): Promise<ServiceResult<boolean>> {
  const context = `team=${teamId} opponent=${opponentTeamId}`;
  const { data: opponentTeam, error: opponentError } = await db
    .from('opponent_teams')
    .select('id, team_id')
    .eq('id', opponentTeamId)
    .maybeSingle();
  if (opponentError) return lookupFailed('opponent team', context, opponentError);
  if (!opponentTeam) return { ok: true, data: false };
  if (opponentTeam.team_id === teamId) return { ok: true, data: true };

  const leagues = await activeLeagueIds(db, teamId);
  if (!leagues.ok) return leagues;
  if (leagues.data.length === 0) return { ok: true, data: false };

  const { data: shared, error: sharedError } = await db
    .from('league_members')
    .select('id')
    .eq('opponent_team_id', opponentTeamId)
    .eq('is_active', true)
    .in('league_id', leagues.data)
    .limit(1);
  if (sharedError) return lookupFailed('league opponent', context, sharedError);
  return { ok: true, data: (shared ?? []).length > 0 };
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
