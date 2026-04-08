import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export type SubscriptionRow = {
  id: string;
  tier: string;
  status: string;
  entity_type: string;
  team_id: string | null;
  league_id: string | null;
};

/**
 * Get the active or trial subscription for a team.
 * Returns null if no active/trial subscription exists.
 */
export async function getSubscriptionForTeam(
  client: AnyClient,
  teamId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await client
    .from('subscriptions')
    .select('id, tier, status, entity_type, team_id, league_id')
    .eq('entity_type', 'team')
    .eq('team_id', teamId)
    .in('status', ['active', 'trial'])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Get the active or trial subscription for a league.
 * Returns null if no active/trial subscription exists.
 */
export async function getSubscriptionForLeague(
  client: AnyClient,
  leagueId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await client
    .from('subscriptions')
    .select('id, tier, status, entity_type, team_id, league_id')
    .eq('entity_type', 'league')
    .eq('league_id', leagueId)
    .in('status', ['active', 'trial'])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
