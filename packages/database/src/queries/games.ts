import type { TypedSupabaseClient } from '../client';
import type { Database } from '../types/supabase';

type GameInsert = Database['public']['Tables']['games']['Insert'];
type GameUpdate = Database['public']['Tables']['games']['Update'];

export async function getGamesForSeason(client: TypedSupabaseClient, seasonId: string) {
  const { data, error } = await client
    .from('games')
    .select('*')
    .eq('season_id', seasonId)
    .order('scheduled_at');
  if (error) throw error;
  return data;
}

export async function getGameById(client: TypedSupabaseClient, gameId: string) {
  const { data, error } = await client
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  if (error) throw error;
  return data;
}

export async function createGame(client: TypedSupabaseClient, game: GameInsert) {
  const { data, error } = await client.from('games').insert(game).select().single();
  if (error) throw error;
  return data;
}

export async function updateGame(
  client: TypedSupabaseClient,
  gameId: string,
  updates: GameUpdate,
) {
  const { data, error } = await client
    .from('games')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', gameId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getUpcomingGames(client: TypedSupabaseClient, teamId: string, limit = 5) {
  const { data, error } = await client
    .from('games')
    .select('*, seasons!inner(team_id)')
    .eq('seasons.team_id', teamId)
    .gte('scheduled_at', new Date().toISOString())
    .in('status', ['scheduled', 'in_progress'])
    .order('scheduled_at')
    .limit(limit);
  if (error) throw error;
  return data;
}
