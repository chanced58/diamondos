import { createClient } from '@supabase/supabase-js';
import { getSubscriptionForTeam, getSubscriptionForLeague, getLeagueForTeam } from '@baseball/database';
import { SubscriptionTier } from '@baseball/shared';

/**
 * Resolves the effective subscription tier for a team.
 *
 * Resolution order:
 * 1. Direct team subscription (active/trial) → return that tier
 * 2. Team belongs to a league with an active subscription → inherit league tier
 * 3. Default → free
 */
export async function getTeamTier(teamId: string): Promise<SubscriptionTier> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return SubscriptionTier.FREE;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  try {
    // 1. Check for a direct team subscription
    const teamSub = await getSubscriptionForTeam(db, teamId);
    if (teamSub) {
      return toTier(teamSub.tier);
    }

    // 2. Check if the team belongs to a league with an active subscription
    const league = await getLeagueForTeam(db, teamId);
    if (league) {
      const leagueSub = await getSubscriptionForLeague(db, league.id);
      if (leagueSub) {
        return toTier(leagueSub.tier);
      }
    }
  } catch (err) {
    console.error(`[team-tier] Failed to resolve tier for team ${teamId}:`, err);
  }

  // 3. Default to free (fail-closed)
  return SubscriptionTier.FREE;
}

/** Safely convert a DB tier string to the SubscriptionTier enum. */
function toTier(value: string): SubscriptionTier {
  if (value === 'starter') return SubscriptionTier.STARTER;
  if (value === 'pro') return SubscriptionTier.PRO;
  // enterprise and anything unknown fall back to pro (enterprise ≥ pro)
  if (value === 'enterprise') return SubscriptionTier.PRO;
  return SubscriptionTier.FREE;
}
