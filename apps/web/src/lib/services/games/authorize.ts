import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole } from '@baseball/shared';
import { getAuthorizedCoach } from '@/lib/games/finalize';
import { authorizeLeagueStaff } from '../league-admin/authorize';
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

/**
 * League staff (admins and managers) may score and set lineups for the HOME
 * row of a league game, the canonical book; never the away row, which belongs
 * to the away team. False for any game that is not a league game's home row.
 * Mirrors the `league_home_game_staff` RLS helper.
 */
export async function authorizeLeagueGameScorer(
  db: SupabaseClient,
  actorUserId: string,
  gameId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('league_games')
    .select('league_id')
    .eq('home_game_id', gameId)
    .maybeSingle();
  if (error) {
    console.error(`[games] authorizeLeagueGameScorer read failed game=${gameId} actor=${actorUserId}:`, error);
    return false;
  }
  if (!data) return false;
  const access = await authorizeLeagueStaff(db, actorUserId, (data as { league_id: string }).league_id, {
    requireAdmin: false,
  });
  return access.ok;
}

export interface AuthorizedScorer {
  game: AuthorizedGame;
  /** True when the actor got in as league staff on the home row, not as a coach of the game. */
  asLeagueStaff: boolean;
}

/**
 * Who may run a game's book — start it, correct its play-by-play and end it:
 * its coaches (as `authorizeGameCoach`), and league staff on the HOME row of a
 * league game, so a game neither team scores can still be run from the League
 * Games page. The game row comes back with the same columns either way;
 * `asLeagueStaff` says which way the actor got in (league staff have no seat
 * on the team, so the game page is closed to them).
 */
export async function authorizeGameScorer(
  db: SupabaseClient,
  actorUserId: string,
  gameId: string,
): Promise<ServiceResult<AuthorizedScorer>> {
  const coach = await authorizeGameCoach(db, actorUserId, gameId);
  if (coach.ok) return { ok: true, data: { game: coach.data, asLeagueStaff: false } };
  if (!(await authorizeLeagueGameScorer(db, actorUserId, gameId))) return coach;

  const { data, error } = await db
    .from('games')
    .select('team_id, opponent_name, opponent_team_id, scheduled_at, time_zone, status, location_type, neutral_home_team, tournament_id')
    .eq('id', gameId)
    .maybeSingle();
  if (error || !data) return serviceError('not_found', 'Game not found.');
  return { ok: true, data: { game: data as AuthorizedGame, asLeagueStaff: true } };
}

/** `authorizeGameScorer`, answering just the game row. */
export async function authorizeGameStart(
  db: SupabaseClient,
  actorUserId: string,
  gameId: string,
): Promise<ServiceResult<AuthorizedGame>> {
  const scorer = await authorizeGameScorer(db, actorUserId, gameId);
  return scorer.ok ? { ok: true, data: scorer.data.game } : scorer;
}
