import type { TypedSupabaseClient } from '@baseball/database';
import { getTournamentTeamOptions, type TournamentTeamOption } from '@baseball/database';

export type TournamentAccess = {
  enabled: boolean;
  teams: TournamentTeamOption[];
};

export async function getTournamentAccess(
  client: TypedSupabaseClient,
  userId: string,
): Promise<TournamentAccess> {
  const [profileResult, teams] = await Promise.all([
    client.from('user_profiles').select('tournament_mode_enabled').eq('id', userId).maybeSingle(),
    getTournamentTeamOptions(client, userId),
  ]);
  if (profileResult.error) throw profileResult.error;
  return { enabled: profileResult.data?.tournament_mode_enabled === true, teams };
}
