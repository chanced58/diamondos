import type { SupabaseClient } from '@supabase/supabase-js';
import {
  conflictKey,
  describeScoreConflict,
  gameIdInputSchema,
  isCoachRole,
  weAreHome,
  type GameDetailResponse,
  type GameTakeaway,
} from '@baseball/shared';
import { getGameWeaknesses } from '@baseball/database';
import { loadReconciliationForGame } from '@/lib/dual-scorekeeper/load';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * Everything the game detail screen shows, as the web game page computes it.
 *
 * Visible to platform admins and active members of the game's team; anyone
 * else gets `not_found` so a game id doesn't reveal that the game exists.
 */
export async function loadGameDetail(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<GameDetailResponse>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  const { data: game } = await db.from('games').select('*').eq('id', gameId).maybeSingle();
  if (!game) return serviceError('not_found', 'Game not found.');

  const viewer = await resolveViewer(db, actorUserId, game.team_id as string);
  if (!viewer) return serviceError('not_found', 'Game not found.');

  const isCompleted = game.status === 'completed';

  const [lineupCount, opponentLineupCount, takeaways, reconciliation] = await Promise.all([
    countRows(db, 'game_lineups', gameId),
    countRows(db, 'opponent_game_lineups', gameId),
    isCompleted && viewer.isCoach ? loadTakeaways(db, game) : Promise.resolve(null),
    isCompleted ? loadReconciliationForGame(db, gameId) : Promise.resolve(null),
  ]);

  return serviceOk({
    game: {
      id: game.id,
      teamId: game.team_id,
      status: game.status,
      opponentName: game.opponent_name ?? null,
      opponentTeamId: game.opponent_team_id ?? null,
      scheduledAt: game.scheduled_at,
      timeZone: game.time_zone ?? null,
      locationType: game.location_type,
      neutralHomeTeam: game.neutral_home_team ?? null,
      venueName: game.venue_name ?? null,
      venueAddress: game.address ?? null,
      placeId: game.place_id ?? null,
      notes: game.notes ?? null,
      homeScore: game.home_score ?? 0,
      awayScore: game.away_score ?? 0,
      currentInning: game.current_inning ?? null,
      latitude: game.latitude ?? null,
      longitude: game.longitude ?? null,
      tournamentId: game.tournament_id ?? null,
    },
    viewer: { isCoach: viewer.isCoach },
    hasLineup: lineupCount > 0,
    hasOpponentLineup: opponentLineupCount > 0,
    takeaways,
    reconciliation: reconciliation
      ? {
          reconciliationId: reconciliation.reconciliationId,
          homeTeamLabel: reconciliation.homeTeamLabel,
          awayTeamLabel: reconciliation.awayTeamLabel,
          canOverride: viewer.isCoach && reconciliation.viewerOnHomeSide,
          conflicts: reconciliation.conflicts.map((conflict) => {
            const key = conflictKey(conflict);
            return {
              key,
              label: describeScoreConflict(conflict),
              homeLog: conflict.homeLog,
              awayLog: conflict.awayLog,
              overridden: reconciliation.overrides.some((o) => o.key === key && o.useAwayValue),
            };
          }),
        }
      : null,
  });
}

async function resolveViewer(
  db: SupabaseClient,
  userId: string,
  teamId: string,
): Promise<{ isCoach: boolean } | null> {
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

  if (profile?.is_platform_admin) return { isCoach: true };
  if (!membership) return null;
  return { isCoach: isCoachRole(membership.role as string) };
}

async function countRows(db: SupabaseClient, table: string, gameId: string): Promise<number> {
  const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq('game_id', gameId);
  return count ?? 0;
}

const MAX_TAKEAWAYS = 3;

async function loadTakeaways(
  db: SupabaseClient,
  game: Record<string, unknown>,
): Promise<NonNullable<GameDetailResponse['takeaways']>> {
  const weHome = weAreHome(game.location_type as string, game.neutral_home_team as string | null);
  const ourScore = (weHome ? game.home_score : game.away_score) as number;
  const theirScore = (weHome ? game.away_score : game.home_score) as number;
  const lostGame = ourScore < theirScore;

  try {
    const weaknesses = await getGameWeaknesses(db as never, game.id as string, game.team_id as string);
    const items: GameTakeaway[] = weaknesses.slice(0, MAX_TAKEAWAYS).map((w) => ({
      code: w.code,
      label: w.label,
      description: w.description,
      severity: w.severity,
      metric: w.evidence.metric,
    }));
    return { lostGame, unavailable: false, items };
  } catch (err) {
    console.error('[loadGameDetail] getGameWeaknesses failed', { gameId: game.id, teamId: game.team_id, err });
    return { lostGame, unavailable: true, items: [] };
  }
}
