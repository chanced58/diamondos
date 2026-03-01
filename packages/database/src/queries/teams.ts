import type { TypedSupabaseClient } from '../client';

export async function getTeamById(client: TypedSupabaseClient, teamId: string) {
  const { data, error } = await client
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single();
  if (error) throw error;
  return data;
}

export async function getTeamsForUser(client: TypedSupabaseClient, userId: string) {
  const { data, error } = await client
    .from('team_members')
    .select('role, is_active, joined_at, teams(*)')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
  return data;
}

export async function getActiveSeasonForTeam(client: TypedSupabaseClient, teamId: string) {
  const { data, error } = await client
    .from('seasons')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTeamMembers(client: TypedSupabaseClient, teamId: string) {
  const { data, error } = await client
    .from('team_members')
    .select('*, user_profiles(*)')
    .eq('team_id', teamId)
    .eq('is_active', true);
  if (error) throw error;
  return data;
}
