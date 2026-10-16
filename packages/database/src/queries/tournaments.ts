import type { CreateTournamentInput, TournamentCreationResult } from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';
import type { Json } from '../types/supabase';

export type TournamentTeamOption = {
  id: string;
  name: string;
  organization: string | null;
  stateCode: string | null;
  role: string;
};

/** Returns active teams the user is allowed to select when creating a tournament. */
export async function getTournamentTeamOptions(
  client: TypedSupabaseClient,
  userId: string,
): Promise<TournamentTeamOption[]> {
  const { data, error } = await client
    .from('team_members')
    .select('role, teams!inner(id, name, organization, state_code)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['head_coach', 'athletic_director']);
  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    if (!team) return [];
    return [{
      id: team.id,
      name: team.name,
      organization: team.organization,
      stateCode: team.state_code,
      role: row.role,
    }];
  });
}

/** Calls the permission-checked transaction; all IDs are assigned by Postgres. */
export async function createTournament(
  client: TypedSupabaseClient,
  input: CreateTournamentInput,
): Promise<TournamentCreationResult> {
  const { data, error } = await client
    .rpc('create_tournament', { p_input: input as unknown as Json })
    .single();
  if (error) throw error;
  return {
    tournamentId: data.tournament_id,
    teamId: data.team_id,
    seasonId: data.season_id,
  };
}
