import type { GameRsvp, GameRsvpStatus } from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const TABLE = 'game_rsvps' as never;

interface RawGameRsvpRow {
  id: string;
  game_id: string;
  player_id: string;
  user_id: string;
  status: string;
  note: string | null;
  responded_at: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: RawGameRsvpRow): GameRsvp {
  return {
    id: row.id,
    gameId: row.game_id,
    playerId: row.player_id,
    userId: row.user_id,
    status: row.status as GameRsvpStatus,
    note: row.note,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGameRsvps(
  client: TypedSupabaseClient,
  gameId: string,
): Promise<GameRsvp[]> {
  const { data, error } = await client.from(TABLE).select('*').eq('game_id', gameId);
  if (error) throw error;
  return ((data ?? []) as unknown as RawGameRsvpRow[]).map(mapRow);
}

/**
 * RSVPs across a set of games, restricted to a set of players — one round
 * trip for e.g. a games list badge covering a parent's several children.
 */
export async function listGameRsvpsForPlayers(
  client: TypedSupabaseClient,
  gameIds: string[],
  playerIds: string[],
): Promise<GameRsvp[]> {
  if (gameIds.length === 0 || playerIds.length === 0) return [];
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .in('game_id', gameIds)
    .in('player_id', playerIds);
  if (error) throw error;
  return ((data ?? []) as unknown as RawGameRsvpRow[]).map(mapRow);
}

export interface UpsertGameRsvpArgs {
  gameId: string;
  playerId: string;
  status: GameRsvpStatus;
  note?: string | null;
  respondedBy: string;
}

export async function upsertGameRsvp(
  client: TypedSupabaseClient,
  args: UpsertGameRsvpArgs,
): Promise<GameRsvp> {
  const { data, error } = await client
    .from(TABLE)
    .upsert(
      {
        game_id: args.gameId,
        player_id: args.playerId,
        status: args.status,
        note: args.note ?? null,
        user_id: args.respondedBy,
        responded_at: new Date().toISOString(),
      } as never,
      { onConflict: 'game_id,player_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data as unknown as RawGameRsvpRow);
}
