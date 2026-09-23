import { renderHook, waitFor } from '@testing-library/react-native';
import { resolveGameIdentity, type GameIdentityInput } from '../game-identity';
import { useGameIdentity } from '../use-game-identity';

/**
 * F7 (CodeRabbit correctness bug, PR #209): `useGameIdentity`'s WatermelonDB
 * lookup kept the *previous* `gameId`'s row in state until the new lookup
 * resolved — or forever, if it failed — so the scoring screen could use the
 * wrong roster, league rules, and `isHome` for the game actually on screen.
 * The fix tracks which `gameId` the fetched row belongs to (`resolvedGameId`)
 * and only exposes `game` when it still matches the current `gameId`. These
 * exercise the hook itself (not just the pure `resolveGameIdentity`) against
 * a mocked WatermelonDB `database.get('games').query(...).fetch()` whose
 * promise resolution we control per gameId, to prove the stale-row window is
 * closed on both a slow lookup and a failing one.
 */

type PendingSettlers = {
  resolve: (rows: unknown[]) => void;
  reject: (err: unknown) => void;
};

const mockPendingByGameId: Record<string, PendingSettlers[]> = {};

const mockQuery = jest.fn((clause: { comparison: { right: { value: string } } }) => {
  const gameId = clause.comparison.right.value;
  return {
    fetch: () =>
      new Promise<unknown[]>((resolve, reject) => {
        (mockPendingByGameId[gameId] ??= []).push({ resolve, reject });
      }),
  };
});
const mockGet = jest.fn(() => ({ query: mockQuery }));

jest.mock('../../../db', () => ({ database: { get: () => mockGet() } }));
jest.mock('../../../providers/RoleProvider', () => ({ useRole: () => ({ activeTeam: null }) }));
jest.mock('expo-router', () => ({
  __esModule: true,
  useLocalSearchParams: () => ({}),
}));

function mkGameRow(overrides: Record<string, unknown> = {}) {
  return {
    remoteId: 'unused',
    teamId: 'team-1',
    opponentName: 'Riverdale Ravens',
    locationType: 'home',
    neutralHomeTeam: null,
    ...overrides,
  };
}

/** Settles the oldest still-pending fetch for `gameId`, in FIFO order. */
function resolveLookup(gameId: string, rows: unknown[]) {
  const pending = mockPendingByGameId[gameId]?.shift();
  if (!pending) throw new Error(`No pending fetch for gameId=${gameId}`);
  pending.resolve(rows);
}

function rejectLookup(gameId: string, err: unknown) {
  const pending = mockPendingByGameId[gameId]?.shift();
  if (!pending) throw new Error(`No pending fetch for gameId=${gameId}`);
  pending.reject(err);
}

describe('useGameIdentity — stale row after gameId changes (F7)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockPendingByGameId)) delete mockPendingByGameId[key];
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('exposes the row once the lookup for the current gameId resolves', async () => {
    const { result } = renderHook(({ gameId }) => useGameIdentity(gameId), {
      initialProps: { gameId: 'game-1' },
    });

    expect(result.current.game).toBeNull();

    resolveLookup('game-1', [mkGameRow({ opponentName: 'Ravens' })]);
    await waitFor(() => expect(result.current.game).not.toBeNull());

    expect(result.current.game?.opponentName).toBe('Ravens');
  });

  it('does not show the previous game\'s row after gameId changes, before the new lookup resolves', async () => {
    const { result, rerender } = renderHook(({ gameId }) => useGameIdentity(gameId), {
      initialProps: { gameId: 'game-1' },
    });
    resolveLookup('game-1', [mkGameRow({ opponentName: 'Ravens' })]);
    await waitFor(() => expect(result.current.game?.opponentName).toBe('Ravens'));

    rerender({ gameId: 'game-2' });

    // Before game-2's lookup resolves, the hook must not keep exposing
    // game-1's row (the bug: it would use game-1's roster/rules/isHome for
    // the game now on screen).
    expect(result.current.game).toBeNull();

    resolveLookup('game-2', [mkGameRow({ teamId: 'team-2', opponentName: 'Wolves' })]);
    await waitFor(() => expect(result.current.game?.opponentName).toBe('Wolves'));
  });

  it('does not fall back to the previous game\'s row when the new lookup fails', async () => {
    const { result, rerender } = renderHook(({ gameId }) => useGameIdentity(gameId), {
      initialProps: { gameId: 'game-1' },
    });
    resolveLookup('game-1', [mkGameRow({ opponentName: 'Ravens' })]);
    await waitFor(() => expect(result.current.game?.opponentName).toBe('Ravens'));

    rerender({ gameId: 'game-2' });
    expect(result.current.game).toBeNull();

    rejectLookup('game-2', new Error('lookup failed'));
    // Give the rejected promise's microtask a turn to run through the
    // effect's catch handler.
    await waitFor(() => expect(warnSpy).toHaveBeenCalled());

    // Must stay null — never fall back to game-1's now-stale row.
    expect(result.current.game).toBeNull();
  });
});

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
