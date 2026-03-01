import type { TypedSupabaseClient } from '../client';
import type { Database } from '../types/supabase';

type PlayerInsert = Database['public']['Tables']['players']['Insert'];
type PlayerUpdate = Database['public']['Tables']['players']['Update'];

export async function getRosterForSeason(client: TypedSupabaseClient, seasonId: string) {
  const { data, error } = await client
    .from('season_rosters')
    .select('*, players(*)')
    .eq('season_id', seasonId);
  if (error) throw error;
  return data;
}

export async function getPlayersForTeam(client: TypedSupabaseClient, teamId: string) {
  const { data, error } = await client
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('last_name');
  if (error) throw error;
  return data;
}

export async function createPlayer(client: TypedSupabaseClient, player: PlayerInsert) {
  const { data, error } = await client.from('players').insert(player).select().single();
  if (error) throw error;
  return data;
}

export async function updatePlayer(
  client: TypedSupabaseClient,
  playerId: string,
  updates: PlayerUpdate,
) {
  const { data, error } = await client
    .from('players')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', playerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addPlayerToSeason(
  client: TypedSupabaseClient,
  seasonId: string,
  playerId: string,
) {
  const { data, error } = await client
    .from('season_rosters')
    .insert({ season_id: seasonId, player_id: playerId })
    .select()
    .single();
  if (error) throw error;
  return data;
}
