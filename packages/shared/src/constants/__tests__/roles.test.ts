import { isScorerRole, isTeamRole, TEAM_ROLES } from '../roles';

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

describe('isScorerRole', () => {
  it('should let coaches, athletic directors and scorekeepers run a game\'s book', () => {
    for (const role of ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper']) {
      expect(isScorerRole(role)).toBe(true);
    }
  });

  it('should not let players, parents or staff run a game\'s book', () => {
    for (const role of ['player', 'parent', 'staff', '', null, undefined]) {
      expect(isScorerRole(role)).toBe(false);
    }
  });
});
