import { guestAccessFor } from '../guest-access';

describe('guestAccessFor', () => {
  it('should let coaches search other teams for a guest', () => {
    expect(guestAccessFor('head_coach', false)).toBe('all_teams');
    expect(guestAccessFor('assistant_coach', false)).toBe('all_teams');
    expect(guestAccessFor('athletic_director', false)).toBe('all_teams');
  });

  it('should let league staff scoring the game search other teams', () => {
    expect(guestAccessFor(null, true)).toBe('all_teams');
  });

  it('should keep a scorekeeper to the league guest history', () => {
    expect(guestAccessFor('scorekeeper', false)).toBe('league_history');
  });

  it('should give a scorekeeper who is also league staff the wider search', () => {
    expect(guestAccessFor('scorekeeper', true)).toBe('all_teams');
  });

  it('should refuse players, parents and outsiders', () => {
    expect(guestAccessFor('player', false)).toBe('none');
    expect(guestAccessFor('parent', false)).toBe('none');
    expect(guestAccessFor(undefined, false)).toBe('none');
  });
});
