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

type TeamMemberWithTeam = {
  role: string;
  is_active: boolean;
  joined_at: string | null;
  teams: { id: string; name: string } | null;
};

export async function getTeamsForUser(client: TypedSupabaseClient, userId: string) {
  const { data, error } = await client
    .from('team_members')
    .select('role, is_active, joined_at, teams(id, name)')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    role: string;
    is_active: boolean;
    joined_at: string | null;
    teams: { id: string; name: string } | { id: string; name: string }[] | null;
  }>;
  return rows.map((row): TeamMemberWithTeam => ({
    role: row.role,
    is_active: row.is_active,
    joined_at: row.joined_at,
    teams: Array.isArray(row.teams) ? (row.teams[0] ?? null) : row.teams,
  }));
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
