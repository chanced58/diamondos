import { isTeamRole, TEAM_ROLES } from '../roles';

describe('isTeamRole', () => {
  it('should accept every value of the team_role enum', () => {
    for (const role of [
      'head_coach', 'assistant_coach', 'player', 'parent', 'athletic_director', 'scorekeeper', 'staff',
    ]) {
      expect(isTeamRole(role)).toBe(true);
    }
    expect(TEAM_ROLES).toHaveLength(7);
  });

  it('should reject unknown strings and non-strings', () => {
    expect(isTeamRole('owner')).toBe(false);
    expect(isTeamRole('')).toBe(false);
    expect(isTeamRole(null)).toBe(false);
    expect(isTeamRole(undefined)).toBe(false);
  });
});
