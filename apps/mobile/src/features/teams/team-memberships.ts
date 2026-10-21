import { isCoachRole, type Feature, type MeTeamMembership, type SubscriptionTier } from '@baseball/shared';

export type TeamRole =
  | 'head_coach'
  | 'assistant_coach'
  | 'scorekeeper'
  | 'player'
  | 'parent'
  | 'athletic_director';

export interface TeamMembership {
  teamId: string;
  teamName: string;
  role: TeamRole;
  playerId?: string;
  isCoach: boolean;
  /** A team created solely for one tournament (`tournament_teams.is_tournament_only`). */
  isTournamentTeam: boolean;
  /** The team's subscription tier; null when it couldn't be resolved (no `/me`). */
  tier: SubscriptionTier | null;
  /** Features the tier grants. Empty when the tier is unknown — gating fails closed. */
  features: Feature[];
}

/** A `team_members` row joined to its team name, as RoleProvider selects it. */
export interface TeamMemberRow {
  team_id: string;
  role: string;
  teams: { name: string } | { name: string }[] | null;
}

/**
 * Fallback mapping from a direct `team_members` read, used when `/me` is
 * unreachable and nothing is cached. Tier and features are unknown there
 * (subscriptions aren't readable by users).
 */
export function mapTeamMemberships(
  rows: TeamMemberRow[],
  playerIdByTeam: Map<string, string>,
  tournamentOnlyTeamIds: Set<string>,
): TeamMembership[] {
  return rows.map((row) => {
    const team = Array.isArray(row.teams) ? row.teams[0] ?? null : row.teams;
    return {
      teamId: row.team_id,
      teamName: team?.name ?? 'Team',
      role: row.role as TeamRole,
      playerId: playerIdByTeam.get(row.team_id),
      isCoach: isCoachRole(row.role),
      isTournamentTeam: tournamentOnlyTeamIds.has(row.team_id),
      tier: null,
      features: [],
    };
  });
}

/** Mapping from the `/api/m/v1/me` payload. */
export function mapMeMemberships(memberships: MeTeamMembership[]): TeamMembership[] {
  return memberships.map((m) => ({
    teamId: m.teamId,
    teamName: m.teamName,
    role: m.role as TeamRole,
    playerId: m.playerId ?? undefined,
    isCoach: isCoachRole(m.role),
    isTournamentTeam: m.isTournamentTeam,
    tier: m.tier,
    features: m.features,
  }));
}
