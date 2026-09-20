import { resolveGameIdentity, type GameIdentityInput } from '../game-identity';

/**
 * M6: entering the scoring screen via a deep link or push notification only
 * ever supplies `gameId`, so the old route-param fallbacks
 * (`opponentName = 'Opponent'`, `teamName = 'Home'`) rendered literally
 * instead of resolving from the synced game record. These cover the
 * resolution rules `resolveGameIdentity` now encodes.
 */

function mkGame(overrides: Partial<GameIdentityInput['game']> = {}): NonNullable<GameIdentityInput['game']> {
  return {
    teamId: 'team-1',
    opponentName: 'Riverdale Ravens',
    locationType: 'home',
    neutralHomeTeam: null,
    ...overrides,
  };
}

describe('resolveGameIdentity', () => {
  it('resolves the real opponent name from the game record on a deep link (params carry only gameId)', () => {
    const identity = resolveGameIdentity({
      game: mkGame({ opponentName: 'Riverdale Ravens' }),
      params: {},
      activeTeam: null,
    });

    expect(identity.opponentName).toBe('Riverdale Ravens');
    expect(identity.opponentName).not.toBe('Opponent');
  });

  it('falls back to today\'s placeholder names before the game lookup resolves', () => {
    const identity = resolveGameIdentity({
      game: null,
      params: {},
      activeTeam: null,
    });

    expect(identity.teamName).toBe('Home');
    expect(identity.opponentName).toBe('Opponent');
  });

  it('treats an empty game.opponentName as "no opponent recorded" and uses the TBD convention, not an empty label', () => {
    const identity = resolveGameIdentity({
      game: mkGame({ opponentName: '' }),
      params: {},
      activeTeam: null,
    });

    expect(identity.opponentName).toBe('TBD');
    expect(identity.opponentName).not.toBe('');
  });

  it('does not use activeTeam.teamName when activeTeam belongs to a different team than the game', () => {
    const identity = resolveGameIdentity({
      game: mkGame({ teamId: 'team-1' }),
      params: {},
      // The device mirrors an in-progress game for another team (over-broad
      // `public_view_in_progress_games` RLS policy) — the active team here
      // is unrelated to the game being scored.
      activeTeam: { teamId: 'team-2', teamName: 'Other Team Coaches Are Viewing' },
    });

    expect(identity.teamName).not.toBe('Other Team Coaches Are Viewing');
    expect(identity.teamName).toBe('Home');
  });

  it('uses activeTeam.teamName when activeTeam.teamId matches the game team', () => {
    const identity = resolveGameIdentity({
      game: mkGame({ teamId: 'team-1' }),
      params: {},
      activeTeam: { teamId: 'team-1', teamName: 'Eastside Eagles' },
    });

    expect(identity.teamName).toBe('Eastside Eagles');
  });

  it('swaps homeLabel/awayLabel for a road game, preserving the existing ScoreBoard mapping', () => {
    const identity = resolveGameIdentity({
      game: mkGame({ teamId: 'team-1', locationType: 'away', opponentName: 'Riverdale Ravens' }),
      params: {},
      activeTeam: { teamId: 'team-1', teamName: 'Eastside Eagles' },
    });

    expect(identity.isHome).toBe(false);
    expect(identity.homeLabel).toBe('Riverdale Ravens');
    expect(identity.awayLabel).toBe('Eastside Eagles');
  });
});
