import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Feature,
  MOBILE_API_VERSION,
  hasFeature,
  type MeLeagueRole,
  type MeResponse,
  type MeTeamMembership,
  type SubscriptionTier,
} from '@baseball/shared';
import { resolveTeamTier } from '@/lib/team-tier';
import { ensureChannelMembership, healMissingTeamMembership } from '@/lib/membership-self-heal';

interface MembershipRow {
  team_id: string;
  role: string;
  teams: { name: string; organization: string | null } | { name: string; organization: string | null }[] | null;
}

interface LeagueStaffRow {
  league_id: string;
  role: MeLeagueRole['role'];
  leagues: { name: string; slug: string | null } | { name: string; slug: string | null }[] | null;
}

const ALL_FEATURES = Object.values(Feature);

export function featuresForTier(tier: SubscriptionTier): Feature[] {
  return ALL_FEATURES.filter((feature) => hasFeature(tier, feature));
}

/**
 * Builds the mobile bootstrap payload (`GET /api/m/v1/me`) for `user`.
 *
 * Runs the same membership/channel self-healing as the web app shell first,
 * so a user whose first launch is on mobile isn't stranded without teams.
 * `db` must be a service-role client: tiers live in `subscriptions`, which
 * RLS hides from users, and the self-healing writes rows users can't.
 */
export async function loadMe(
  db: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<MeResponse> {
  let membershipRows = await readMemberships(db, user.id);

  if (membershipRows.length === 0) {
    const { isPlatformAdmin, hasPlayerProfile } = await readHealingGates(db, user.id);
    if (!isPlatformAdmin && !hasPlayerProfile) {
      const healedTeam = await healMissingTeamMembership(db, user);
      if (healedTeam) membershipRows = await readMemberships(db, user.id);
    }
  }

  const teamIds = membershipRows.map((row) => row.team_id);
  await ensureChannelMembership(db, user.id, teamIds);

  const [playerIdByTeam, tournamentOnlyTeamIds, tiers, leagueRoles, profile] = await Promise.all([
    readPlayerIds(db, user.id),
    readTournamentOnlyTeamIds(db, teamIds),
    Promise.all(teamIds.map((teamId) => resolveTeamTier(db, teamId))),
    readLeagueRoles(db, user.id),
    readProfile(db, user.id),
  ]);

  const memberships: MeTeamMembership[] = membershipRows.map((row, index) => {
    const team = Array.isArray(row.teams) ? row.teams[0] ?? null : row.teams;
    const tier = tiers[index];
    return {
      teamId: row.team_id,
      teamName: team?.name ?? 'Team',
      organization: team?.organization ?? null,
      role: row.role,
      playerId: playerIdByTeam.get(row.team_id) ?? null,
      isTournamentTeam: tournamentOnlyTeamIds.has(row.team_id),
      tier,
      features: featuresForTier(tier),
    };
  });

  return {
    apiVersion: MOBILE_API_VERSION,
    user: {
      id: user.id,
      email: user.email ?? null,
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
    },
    memberships,
    leagueRoles,
  };
}

async function readMemberships(db: SupabaseClient, userId: string): Promise<MembershipRow[]> {
  const { data, error } = await db
    .from('team_members')
    .select('team_id, role, teams(name, organization)')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw new Error(`team_members read failed for user ${userId}: ${error.message}`);
  return (data ?? []) as unknown as MembershipRow[];
}

async function readHealingGates(db: SupabaseClient, userId: string) {
  const [adminResult, playerProfileResult] = await Promise.all([
    db.from('user_profiles').select('is_platform_admin').eq('id', userId).maybeSingle(),
    db.from('player_profiles').select('user_id').eq('user_id', userId).maybeSingle(),
  ]);
  return {
    isPlatformAdmin: adminResult.data?.is_platform_admin === true,
    hasPlayerProfile: Boolean(playerProfileResult.data),
  };
}

async function readPlayerIds(db: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const { data, error } = await db.from('players').select('id, team_id').eq('user_id', userId);
  if (error) console.warn(`[me] players read failed user=${userId}:`, error.message);
  const playerIdByTeam = new Map<string, string>();
  for (const player of (data ?? []) as Array<{ id: string; team_id: string | null }>) {
    if (player.team_id) playerIdByTeam.set(player.team_id, player.id);
  }
  return playerIdByTeam;
}

async function readTournamentOnlyTeamIds(db: SupabaseClient, teamIds: string[]): Promise<Set<string>> {
  if (teamIds.length === 0) return new Set();
  const { data, error } = await db
    .from('tournament_teams')
    .select('team_id')
    .eq('is_tournament_only', true)
    .in('team_id', teamIds);
  if (error) console.warn('[me] tournament_teams read failed:', error.message);
  return new Set(((data ?? []) as Array<{ team_id: string }>).map((row) => row.team_id));
}

async function readLeagueRoles(db: SupabaseClient, userId: string): Promise<MeLeagueRole[]> {
  const { data, error } = await db
    .from('league_staff')
    .select('league_id, role, leagues(name, slug)')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) {
    console.warn(`[me] league_staff read failed user=${userId}:`, error.message);
    return [];
  }
  return ((data ?? []) as unknown as LeagueStaffRow[]).map((row) => {
    const league = Array.isArray(row.leagues) ? row.leagues[0] ?? null : row.leagues;
    return {
      leagueId: row.league_id,
      leagueName: league?.name ?? 'League',
      leagueSlug: league?.slug ?? null,
      role: row.role,
    };
  });
}

async function readProfile(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  return data as { first_name: string | null; last_name: string | null } | null;
}
