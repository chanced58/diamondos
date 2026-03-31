import type { SupabaseClient } from '@supabase/supabase-js';

// Use SupabaseClient<any> because the league tables are not yet in the
// generated Database type. After running `supabase db reset` and
// `pnpm --filter @baseball/database gen-types`, these can be switched
// back to TypedSupabaseClient.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export type LeagueListItem = {
  id: string;
  name: string;
  description: string | null;
  state_code: string | null;
  created_at: string;
  team_count: number;
  staff_count: number;
};

/**
 * Get all leagues with team and staff counts.
 */
export async function getAllLeagues(client: AnyClient): Promise<LeagueListItem[]> {
  const { data, error } = await client
    .from('leagues')
    .select('id, name, description, state_code, created_at, league_members(count), league_staff(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    state_code: l.state_code,
    created_at: l.created_at,
    team_count: l.league_members?.[0]?.count ?? 0,
    staff_count: l.league_staff?.[0]?.count ?? 0,
  }));
}

export type LeagueSummary = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  state_code: string | null;
};

export type LeagueTeam = {
  id: string;
  team_id: string;
  league_id: string;
  division_id: string | null;
  is_active: boolean;
  teams: {
    id: string;
    name: string;
    organization: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
  };
  league_divisions: { id: string; name: string } | null;
};

export type LeagueDivision = {
  id: string;
  league_id: string;
  name: string;
};

/**
 * Get the league for a team. Returns null if the team is not in any league.
 * If a team is in multiple leagues, returns the first active one.
 */
export async function getLeagueForTeam(
  client: AnyClient,
  teamId: string,
): Promise<LeagueSummary | null> {
  const { data, error } = await client
    .from('league_members')
    .select('leagues(id, name, description, logo_url, state_code)')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.leagues) return null;
  const league = Array.isArray(data.leagues) ? data.leagues[0] : data.leagues;
  return league ?? null;
}

/**
 * Get all teams in a league with their division info.
 */
export async function getLeagueTeams(
  client: AnyClient,
  leagueId: string,
) {
  const { data, error } = await client
    .from('league_members')
    .select('id, team_id, league_id, division_id, is_active, teams(id, name, organization, logo_url, primary_color, secondary_color), league_divisions(id, name)')
    .eq('league_id', leagueId)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as unknown as LeagueTeam[];
}

/**
 * Get all team IDs in a league.
 */
export async function getLeagueTeamIds(
  client: AnyClient,
  leagueId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('league_members')
    .select('team_id')
    .eq('league_id', leagueId)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.team_id);
}

/**
 * Get league staff members.
 */
export async function getLeagueStaff(
  client: AnyClient,
  leagueId: string,
) {
  const { data, error } = await client
    .from('league_staff')
    .select('id, league_id, user_id, role, is_active, user_profiles(id, first_name, last_name, email)')
    .eq('league_id', leagueId)
    .eq('is_active', true);
  if (error) throw error;
  return data ?? [];
}

/**
 * Get divisions for a league.
 */
export async function getLeagueDivisions(
  client: AnyClient,
  leagueId: string,
): Promise<LeagueDivision[]> {
  const { data, error } = await client
    .from('league_divisions')
    .select('id, league_id, name')
    .eq('league_id', leagueId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/**
 * Get league channels that a user is a member of.
 */
export async function getLeagueChannelsForUser(
  client: AnyClient,
  leagueId: string,
  userId: string,
) {
  const { data, error } = await client
    .from('league_channel_members')
    .select('league_channel_id, can_post, league_channels!inner(id, league_id, channel_type, name, description)')
    .eq('user_id', userId)
    .eq('league_channels.league_id', leagueId);
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const ch = Array.isArray(row.league_channels) ? row.league_channels[0] : row.league_channels;
    return {
      id: ch!.id,
      league_id: ch!.league_id,
      channel_type: ch!.channel_type as 'announcement' | 'topic' | 'direct',
      name: ch!.name,
      description: ch!.description,
      can_post: row.can_post,
    };
  });
}
