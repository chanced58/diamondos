import { Feature, isHeadCoachOrAdRole, type MeLeagueRole } from '@baseball/shared';
import type { TeamMembership } from './team-memberships';

/**
 * What the signed-in user may do, for UI gating (`useCan`). Cosmetic only:
 * the server (RLS or the `/api/m/v1` services) enforces every rule again.
 *
 * - `team.coach` — coaching staff (head/assistant coach, AD) on the active team
 * - `team.admin` — head coach or athletic director on the active team
 * - `league.staff` — any league staff role
 * - `league.admin` — `league_admin` in at least one league
 * - any `Feature` — the active team's subscription tier grants it
 */
export type Capability = 'team.coach' | 'team.admin' | 'league.staff' | 'league.admin' | Feature;

const FEATURE_VALUES = new Set<string>(Object.values(Feature));

export interface CapabilityContext {
  activeTeam: TeamMembership | null;
  leagueRoles: MeLeagueRole[];
}

export function isLeagueAdmin(leagueRoles: MeLeagueRole[]): boolean {
  return leagueRoles.some((r) => r.role === 'league_admin');
}

export function can(capability: Capability, { activeTeam, leagueRoles }: CapabilityContext): boolean {
  switch (capability) {
    case 'team.coach':
      return activeTeam?.isCoach ?? false;
    case 'team.admin':
      return isHeadCoachOrAdRole(activeTeam?.role);
    case 'league.staff':
      return leagueRoles.length > 0;
    case 'league.admin':
      return isLeagueAdmin(leagueRoles);
    default:
      return FEATURE_VALUES.has(capability) && (activeTeam?.features.includes(capability) ?? false);
  }
}
