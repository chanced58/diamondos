import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Canonical tier values used by the application. */
type AppTier = 'free' | 'starter' | 'pro';

/** Normalize a DB tier string to one of the three app tiers. */
function normalizeTier(dbTier: string): AppTier {
  if (dbTier === 'starter') return 'starter';
  if (dbTier === 'pro' || dbTier === 'enterprise') return 'pro';
  return 'free';
}

/**
 * Resolves the effective subscription tier for a team.
 *
 * Resolution order:
 * 1. Direct team subscription (active/trial)
 * 2. League subscription inheritance (if team belongs to a league)
 * 3. Default → 'free'
 */
export async function resolveEffectiveTier(
  supabase: SupabaseClient,
  teamId: string,
): Promise<AppTier> {
  // 1. Check direct team subscription
  const { data: teamSub } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('entity_type', 'team')
    .eq('team_id', teamId)
    .in('status', ['active', 'trial'])
    .limit(1)
    .maybeSingle();

  if (teamSub?.tier) return normalizeTier(teamSub.tier);

  // 2. Check league subscription inheritance
  const { data: leagueMember } = await supabase
    .from('league_members')
    .select('league_id')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (leagueMember) {
    const { data: leagueSub } = await supabase
      .from('subscriptions')
      .select('tier')
      .eq('entity_type', 'league')
      .eq('league_id', leagueMember.league_id)
      .in('status', ['active', 'trial'])
      .limit(1)
      .maybeSingle();
    if (leagueSub?.tier) return normalizeTier(leagueSub.tier);
  }

  // 3. Default
  return 'free';
}
