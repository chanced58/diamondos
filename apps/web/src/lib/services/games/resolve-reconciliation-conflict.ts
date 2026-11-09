import type { SupabaseClient } from '@supabase/supabase-js';
import {
  conflictKey,
  conflictPlayerId,
  isCoachRole,
  resolveReconciliationConflictInputSchema,
  type ScoreConflict,
} from '@baseball/shared';
import { refreshLeagueGame } from '@/lib/league-games/refresh';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

const FORBIDDEN = 'Only the home team coach can resolve conflicts.';

interface LeagueGameTeams {
  league_id: string;
  away_team_id: string;
}

function failed<T>(what: string, context: string, error: unknown): ServiceResult<T> {
  console.error(`[reconciliation-settler] ${what} failed ${context}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

/**
 * Who settles a two-book difference, returning the home row's league game id.
 * A platform admin or a coach (head, assistant, athletic director) of the home
 * team always may. For a league game, so may a league admin of its league,
 * and an away team coach when the home team has no active head or assistant
 * coach on the app.
 */
async function authorizeSettler(
  db: SupabaseClient,
  actorUserId: string,
  homeGameId: string,
): Promise<ServiceResult<{ leagueGameId: string | null }>> {
  const context = `home_game=${homeGameId} actor=${actorUserId}`;
  const { data: game, error: gameError } = await db
    .from('games')
    .select('team_id, league_game_id')
    .eq('id', homeGameId)
    .maybeSingle();
  if (gameError) return failed('game load', context, gameError);
  if (!game) return serviceError('not_found', 'Game not found.');
  const homeTeamId = game.team_id as string;
  const leagueGameId = (game.league_game_id as string | null) ?? null;

  let leagueGame: LeagueGameTeams | null = null;
  if (leagueGameId) {
    const { data, error } = await db
      .from('league_games')
      .select('league_id, away_team_id')
      .eq('id', leagueGameId)
      .maybeSingle();
    if (error) return failed('league game load', context, error);
    leagueGame = data as LeagueGameTeams | null;
  }

  const teamIds = leagueGame ? [homeTeamId, leagueGame.away_team_id] : [homeTeamId];
  const [profile, memberships, staff] = await Promise.all([
    db.from('user_profiles').select('is_platform_admin').eq('id', actorUserId).maybeSingle(),
    db.from('team_members').select('team_id, role').eq('user_id', actorUserId).eq('is_active', true).in('team_id', teamIds),
    leagueGame
      ? db
          .from('league_staff')
          .select('role')
          .eq('league_id', leagueGame.league_id)
          .eq('user_id', actorUserId)
          .eq('is_active', true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const [what, result] of [['profile', profile], ['memberships', memberships], ['league staff', staff]] as const) {
    if (result.error) return failed(`${what} load`, context, result.error);
  }

  const ok = serviceOk({ leagueGameId });
  if ((profile.data as { is_platform_admin?: boolean } | null)?.is_platform_admin) return ok;
  const seats = (memberships.data ?? []) as { team_id: string; role: string }[];
  const coachesTeam = (teamId: string) => seats.some((seat) => seat.team_id === teamId && isCoachRole(seat.role));
  if (coachesTeam(homeTeamId)) return ok;
  if (!leagueGame) return serviceError('forbidden', FORBIDDEN);
  if ((staff.data as { role?: string } | null)?.role === 'league_admin') return ok;
  if (!coachesTeam(leagueGame.away_team_id)) return serviceError('forbidden', FORBIDDEN);

  const { count, error: coachesError } = await db
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', homeTeamId)
    .eq('is_active', true)
    .in('role', ['head_coach', 'assistant_coach']);
  if (coachesError) return failed('home coaches load', context, coachesError);
  return (count ?? 0) === 0 ? ok : serviceError('forbidden', FORBIDDEN);
}

/** Whether the actor may settle the differences of the reconciliation on `homeGameId`. */
export async function authorizeReconciliationSettler(
  db: SupabaseClient,
  actorUserId: string,
  homeGameId: string,
): Promise<ServiceResult<void>> {
  const result = await authorizeSettler(db, actorUserId, homeGameId);
  return result.ok ? serviceOk(undefined) : result;
}

/**
 * Accepts the away scorekeeper's value for one reconciliation conflict, or
 * reverts it to the home value. A player is settled as a whole (the result
 * takes their whole line from one book): accepting any of a player's
 * conflicts puts all of them on the away value, and reverting clears every
 * one of that player's overrides. Overrides annotate the record and never
 * touch game_events. For a league game the league result and snapshot are
 * then refreshed, since a settled difference can change the result that counts.
 */
export async function resolveReconciliationConflict(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ homeGameId: string }>> {
  const parsed = resolveReconciliationConflictInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const { data: recon } = await db
    .from('game_reconciliations')
    .select('id, home_game_id, conflicts')
    .eq('id', input.reconciliationId)
    .maybeSingle();
  if (!recon) return serviceError('not_found', 'Reconciliation not found.');

  const auth = await authorizeSettler(db, actorUserId, recon.home_game_id as string);
  if (!auth.ok) return auth;

  // Reject a key that no longer matches a current conflict (stale screen or
  // tampered input) so resolved_overrides never accumulates dangling entries.
  const conflicts = Array.isArray(recon.conflicts) ? (recon.conflicts as ScoreConflict[]) : [];
  const target = conflicts.find((c) => conflictKey(c) === input.conflictKey);
  if (!target) {
    return serviceError('conflict', 'That conflict no longer exists — reload the game.');
  }

  // Reverting a player clears an away override on any of their conflicts.
  const playerId = conflictPlayerId(target);
  const keys =
    input.useAwayValue || !playerId
      ? [input.conflictKey]
      : conflicts.filter((c) => conflictPlayerId(c) === playerId).map(conflictKey);

  // Each call is one UPDATE that filters-then-appends, so two near-simultaneous
  // edits can't drop each other's change.
  for (const key of keys) {
    const { error } = await db.rpc('set_reconciliation_override', {
      p_reconciliation_id: input.reconciliationId,
      p_key: key,
      p_use_away: input.useAwayValue,
      p_resolved_by: actorUserId,
    });
    if (error) {
      console.error(`[resolveReconciliationConflict] recon=${input.reconciliationId} key=${key} actor=${actorUserId}:`, error);
      return serviceError('failed', `Failed to save override: ${error.message}`);
    }
  }

  if (auth.data.leagueGameId) await refreshLeagueGame(db, auth.data.leagueGameId, actorUserId);

  return serviceOk({ homeGameId: recon.home_game_id as string });
}
