import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@baseball/database';
import { gameIdInputSchema, type HistoryEvent, type LiveGameResponse } from '@baseball/shared';
import { canViewLiveGameWith } from '@/lib/live/viewer-access';
import { buildLivePlayerNameMap } from '@/lib/live/player-name-map';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * A game for the live viewer: the same people and data as the web /live page —
 * either team's members (when the opponent is a linked team), their linked
 * parents, and platform admins.
 */
export async function loadLiveGame(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LiveGameResponse>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  if (!(await canViewLiveGameWith(db, gameId, actorUserId))) return serviceError('not_found', 'Game not found.');

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, team_id, status, opponent_name, opponent_team_id, scheduled_at, time_zone, venue_name, location_type, neutral_home_team, home_score, away_score')
    .eq('id', gameId)
    .maybeSingle();
  if (gameError) return loadFailed(gameId, actorUserId, 'game', gameError);
  if (!game) return serviceError('not_found', 'Game not found.');

  const opponentTeamId = game.opponent_team_id as string | null;
  const [events, team, players] = await Promise.all([
    db.from('game_events').select('*').eq('game_id', gameId).order('sequence_number'),
    db.from('teams').select('name').eq('id', game.team_id).maybeSingle(),
    buildLivePlayerNameMap(db as unknown as TypedSupabaseClient, [game.team_id as string], opponentTeamId ? [opponentTeamId] : []),
  ]);
  if (events.error) return loadFailed(gameId, actorUserId, 'events', events.error);

  return serviceOk({
    game: {
      id: game.id as string,
      teamId: game.team_id as string,
      status: game.status as LiveGameResponse['game']['status'],
      opponentName: (game.opponent_name as string | null) ?? null,
      scheduledAt: game.scheduled_at as string,
      timeZone: (game.time_zone as string | null) ?? null,
      venueName: (game.venue_name as string | null) ?? null,
      locationType: game.location_type as LiveGameResponse['game']['locationType'],
      neutralHomeTeam: (game.neutral_home_team as LiveGameResponse['game']['neutralHomeTeam']) ?? null,
      homeScore: (game.home_score as number | null) ?? 0,
      awayScore: (game.away_score as number | null) ?? 0,
    },
    teamName: (team.data?.name as string | undefined) ?? 'Our team',
    events: ((events.data ?? []) as Record<string, unknown>[]).map(toHistoryEvent),
    players,
  });
}

function toHistoryEvent(row: Record<string, unknown>): HistoryEvent {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    sequenceNumber: row.sequence_number as number,
    eventType: row.event_type as string,
    inning: row.inning as number,
    isTopOfInning: row.is_top_of_inning as boolean,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    occurredAt: row.occurred_at as string,
    createdBy: (row.created_by as string | null) ?? null,
    deviceId: (row.device_id as string | null) ?? null,
  };
}

function loadFailed(gameId: string, actorUserId: string, what: string, error: unknown): ServiceResult<never> {
  console.error(`[loadLiveGame] game=${gameId} actor=${actorUserId} ${what} read failed:`, error);
  return serviceError('failed', 'Failed to load the live game.');
}
