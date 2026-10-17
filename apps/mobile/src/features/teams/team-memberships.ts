import { isCoachRole } from '@baseball/shared';

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
}

/** A `team_members` row joined to its team name, as RoleProvider selects it. */
export interface TeamMemberRow {
  team_id: string;
  role: string;
  teams: { name: string } | { name: string }[] | null;
}

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
    };
  });
}
