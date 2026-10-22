import type { SupabaseClient } from '@supabase/supabase-js';
import { gameIdInputSchema, weAreHome, type GameHistoryResponse, type HistoryEvent } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';

interface NamedRow {
  id: string;
  first_name: string;
  last_name: string;
}

const fullName = (row: NamedRow) => `${row.first_name} ${row.last_name}`.trim();

/** A joined row arrives as an object, or an array from some PostgREST shapes. */
function joined(raw: unknown): NamedRow | null {
  return ((Array.isArray(raw) ? raw[0] : raw) as NamedRow | null) ?? null;
}

/**
 * A started game's play-by-play for any team member: the raw log since the
 * last reset plus the names to label it with — the same reads as the web
 * history page. Coaches also get the rosters the correction tools pick from.
 */
export async function loadGameHistory(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<GameHistoryResponse>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, team_id, opponent_name, location_type, neutral_home_team, status, home_score, away_score, opponent_team_id')
    .eq('id', gameId)
    .maybeSingle();
  if (gameError) {
    console.error(`[loadGameHistory] game=${gameId} actor=${actorUserId} game read failed:`, gameError);
    return serviceError('failed', 'Failed to load the game history.');
  }
  if (!game) return serviceError('not_found', 'Game not found.');

  const viewer = await resolveGameViewer(db, actorUserId, game.team_id as string);
  if (!viewer) return serviceError('not_found', 'Game not found.');
  if (game.status !== 'in_progress' && game.status !== 'completed') {
    return serviceError('conflict', 'Game history is available once the game has started.');
  }

  const opponentTeamId = game.opponent_team_id as string | null;
  const [events, roster, team, opponentRoster, lineup, opponentLineup] = await Promise.all([
    db.from('game_events').select('*').eq('game_id', gameId).order('sequence_number'),
    db.from('players').select('id, first_name, last_name').eq('team_id', game.team_id).order('last_name'),
    db.from('teams').select('name').eq('id', game.team_id).maybeSingle(),
    opponentTeamId
      ? db.from('opponent_players').select('id, first_name, last_name').eq('opponent_team_id', opponentTeamId).order('last_name')
      : Promise.resolve({ data: [], error: null }),
    db.from('game_lineups').select('players(id, first_name, last_name)').eq('game_id', gameId),
    opponentTeamId
      ? db.from('opponent_game_lineups').select('opponent_players(id, first_name, last_name)').eq('game_id', gameId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = events.error ?? roster.error ?? team.error ?? opponentRoster.error ?? lineup.error ?? opponentLineup.error;
  if (error) {
    console.error(`[loadGameHistory] game=${gameId} actor=${actorUserId} read failed:`, error);
    return serviceError('failed', 'Failed to load the game history.');
  }

  const playerNames: Record<string, string> = {};
  const teamPlayers = ((roster.data ?? []) as NamedRow[]).map((row) => ({ id: row.id, name: fullName(row) }));
  const opponentPlayers = ((opponentRoster.data ?? []) as NamedRow[]).map((row) => ({ id: row.id, name: fullName(row) }));
  for (const player of [...teamPlayers, ...opponentPlayers]) playerNames[player.id] = player.name;
  // Lineups can name players missing from the rosters (guests, since-removed players).
  for (const row of [...(lineup.data ?? []), ...(opponentLineup.data ?? [])] as Record<string, unknown>[]) {
    const player = joined(row.players ?? row.opponent_players);
    if (player && !(player.id in playerNames)) playerNames[player.id] = fullName(player);
  }

  const rows = (events.data ?? []) as Record<string, unknown>[];
  const lastReset = rows.map((row) => row.event_type).lastIndexOf('game_reset');
  const sinceReset = lastReset === -1 ? rows : rows.slice(lastReset + 1);

  return serviceOk({
    gameId,
    status: game.status as GameHistoryResponse['status'],
    teamName: (team.data?.name as string | undefined) ?? 'Our Team',
    opponentName: (game.opponent_name as string | null)?.trim() || 'Opponent',
    weAreHome: weAreHome(game.location_type, game.neutral_home_team),
    homeScore: (game.home_score as number | null) ?? 0,
    awayScore: (game.away_score as number | null) ?? 0,
    isCoach: viewer.isCoach,
    events: sinceReset.map(toHistoryEvent),
    playerNames,
    teamPlayers: viewer.isCoach ? teamPlayers : [],
    opponentPlayers: viewer.isCoach ? opponentPlayers : [],
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
