import { Feature, SubscriptionTier, type MeLeagueRole } from '@baseball/shared';
import { can, isLeagueAdmin } from '../capabilities';
import type { TeamMembership } from '../team-memberships';

function team(overrides: Partial<TeamMembership> = {}): TeamMembership {
  return {
    teamId: 't1',
    teamName: 'Huskies',
    role: 'head_coach',
    isCoach: true,
    isTournamentTeam: false,
    tier: SubscriptionTier.STARTER,
    features: [Feature.DIRECT_MESSAGES],
    ...overrides,
  };
}

const manager: MeLeagueRole = { leagueId: 'l1', leagueName: 'Metro', leagueSlug: null, role: 'league_manager' };
const admin: MeLeagueRole = { ...manager, leagueId: 'l2', role: 'league_admin' };

describe('can', () => {
  it('should gate team roles on the active team', () => {
    const none = { leagueRoles: [] };
    expect(can('team.coach', { ...none, activeTeam: team() })).toBe(true);
    expect(can('team.admin', { ...none, activeTeam: team() })).toBe(true);
    expect(can('team.admin', { ...none, activeTeam: team({ role: 'assistant_coach' }) })).toBe(false);
    expect(can('team.coach', { ...none, activeTeam: team({ role: 'parent', isCoach: false }) })).toBe(false);
    expect(can('team.coach', { ...none, activeTeam: null })).toBe(false);
  });

  it('should gate tier features on the active team only', () => {
    const ctx = { activeTeam: team(), leagueRoles: [] };
    expect(can(Feature.DIRECT_MESSAGES, ctx)).toBe(true);
    expect(can(Feature.OPPONENT_TRACKING, ctx)).toBe(false);
    expect(can(Feature.DIRECT_MESSAGES, { ...ctx, activeTeam: team({ tier: null, features: [] }) })).toBe(false);
  });

  it('should gate league roles across all leagues', () => {
    expect(can('league.staff', { activeTeam: null, leagueRoles: [manager] })).toBe(true);
    expect(can('league.admin', { activeTeam: null, leagueRoles: [manager] })).toBe(false);
    expect(can('league.admin', { activeTeam: null, leagueRoles: [manager, admin] })).toBe(true);
    expect(isLeagueAdmin([])).toBe(false);
  });
});
