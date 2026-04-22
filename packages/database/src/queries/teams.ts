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

export type TeamSummary = {
  id: string;
  name: string;
  organization: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
};

type TeamMemberWithTeam = {
  role: string;
  is_active: boolean;
  joined_at: string | null;
  teams: TeamSummary | null;
};

export async function getTeamsForUser(client: TypedSupabaseClient, userId: string) {
  const { data, error } = await client
    .from('team_members')
    .select('role, is_active, joined_at, teams(id, name, organization, logo_url, primary_color, secondary_color)')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    role: string;
    is_active: boolean;
    joined_at: string | null;
    teams: TeamSummary | TeamSummary[] | null;
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

export async function updateTeamNotificationLead(
  client: TypedSupabaseClient,
  teamId: string,
  minutes: number,
): Promise<void> {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) {
    throw new Error('practice_notification_lead_minutes must be an integer in [0, 10080]');
  }
  const { error } = await client
    .from('teams')
    .update({ practice_notification_lead_minutes: minutes } as never)
    .eq('id', teamId);
  if (error) throw error;
}
