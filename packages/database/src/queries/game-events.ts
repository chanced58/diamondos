import type { TypedSupabaseClient } from '../client';
import type { Database } from '../types/supabase';

type GameEventInsert = Database['public']['Tables']['game_events']['Insert'];

/** Fetches all events for a game in sequence order. Used for state replay. */
export async function getGameEvents(client: TypedSupabaseClient, gameId: string) {
  const { data, error } = await client
    .from('game_events')
    .select('*')
    .eq('game_id', gameId)
    .order('sequence_number');
  if (error) throw error;
  return data;
}

/** Fetches events since a given sequence number (for incremental sync). */
export async function getGameEventsSince(
  client: TypedSupabaseClient,
  gameId: string,
  afterSequenceNumber: number,
) {
  const { data, error } = await client
    .from('game_events')
    .select('*')
    .eq('game_id', gameId)
    .gt('sequence_number', afterSequenceNumber)
    .order('sequence_number');
  if (error) throw error;
  return data;
}

/**
 * Inserts a game event. Uses upsert with ignoreDuplicates for idempotent offline sync.
 * game_events are immutable — Update type is `never` in the DB types.
 */
export async function insertGameEvent(client: TypedSupabaseClient, event: GameEventInsert) {
  const { data, error } = await client
    .from('game_events')
    .upsert(event, { onConflict: 'id', ignoreDuplicates: true })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Inserts multiple game events in one call (batch sync from offline device). */
export async function insertGameEventsBatch(
  client: TypedSupabaseClient,
  events: GameEventInsert[],
) {
  const { data, error } = await client
    .from('game_events')
    .upsert(events, { onConflict: 'id', ignoreDuplicates: true })
    .select();
  if (error) throw error;
  return data;
}

/** Returns the highest sequence_number for a given game. */
export async function getLastSequenceNumber(
  client: TypedSupabaseClient,
  gameId: string,
): Promise<number> {
  const { data, error } = await client
    .from('game_events')
    .select('sequence_number')
    .eq('game_id', gameId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.sequence_number ?? 0;
}
