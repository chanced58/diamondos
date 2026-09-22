import { Q } from '@nozbe/watermelondb';
import { render, screen } from '@testing-library/react-native';

/**
 * Final whole-branch review, Blocking 1: the Games tab query had no team
 * filter — scoping was purely RLS — and `public_view_in_progress_games`
 * (20260220000010:186-189) has no `TO` clause, so every device mirrors every
 * in-progress game platform-wide. W8's pin-to-top then promoted a foreign
 * team's live game near the top of a coach's list (confirmed in production:
 * a Las Vegas Jokers game surfaced on a Huskies coach's screen). Two other
 * fixes on this branch already met this exact fact and scoped by team id —
 * `schedule.tsx`'s local games read (`Q.where('team_id', activeTeam.teamId)`)
 * and `game-identity.ts` (refuses to label a foreign game with the active
 * team's name). This applies the same scoping to the Games tab query.
 *
 * The WatermelonDB query itself can't be exercised against a real adapter
 * under Jest (`src/db/index.ts` initializes a native SQLiteAdapter, which
 * throws outside the app — see the comment atop `game-identity.ts`), so the
 * seam under test is the `withObservables` producer function: we mock
 * `@nozbe/with-observables` to capture the producer and call `database.get`
 * ourselves, and assert on the `Q` clauses actually passed to `.query(...)`.
 */

const mockQuery = jest.fn(() => ({
  observe: () => ({ pipe: () => 'OBSERVABLE' }),
}));
const mockGet = jest.fn(() => ({ query: mockQuery }));

jest.mock('../../../../src/db', () => ({
  database: { get: mockGet },
}));

let mockCapturedProducer: ((props: { teamId: string }) => unknown) | null = null;
jest.mock('@nozbe/with-observables', () => {
  return (_keys: string[], producer: (props: { teamId: string }) => unknown) => {
    mockCapturedProducer = producer;
    // Not exercised directly by these tests (they either call the captured
    // producer themselves, or render `GamesScreen`, which only mounts this
    // wrapped component when an active team exists).
    return () => () => null;
  };
});

jest.mock('../../../../src/providers/RoleProvider', () => ({
  useRole: jest.fn(),
}));

jest.mock('../../../../src/features/rsvp/useGameRsvps', () => ({
  useGameRsvps: () => ({
    myPlayers: [],
    rsvpByKey: new Map(),
    savingKeys: new Set(),
    setRsvp: jest.fn(),
    error: null,
  }),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn() },
}));

// Required (not statically imported) so these evaluate strictly after the
// mock setup above: a static `import` would be hoisted by babel ahead of
// `mockQuery`/`mockCapturedProducer`'s own declarations, letting `../index`
// run (and `withObservables` capture the producer) before those `let`/`const`
// bindings exist.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useRole } = require('../../../../src/providers/RoleProvider');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GamesScreen = require('../index').default;
const mockUseRole = useRole as jest.Mock;

describe('games/index — team scoping (final review Blocking 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes the games query to the active team, not platform-wide', () => {
    expect(mockCapturedProducer).not.toBeNull();

    mockCapturedProducer!({ teamId: 'huskies-team-id' });

    expect(mockQuery).toHaveBeenCalledWith(
      Q.where('team_id', 'huskies-team-id'),
      Q.sortBy('scheduled_at', Q.desc),
    );
  });

  it('excludes another team’s games: a different teamId produces a query scoped to that id, never unscoped', () => {
    mockCapturedProducer!({ teamId: 'jokers-team-id' });

    expect(mockQuery).toHaveBeenCalledWith(
      Q.where('team_id', 'jokers-team-id'),
      Q.sortBy('scheduled_at', Q.desc),
    );
    // Never called with just the sort clause (the old, unscoped query).
    expect(mockQuery).not.toHaveBeenCalledWith(Q.sortBy('scheduled_at', Q.desc));
  });

  it('does not run an unscoped query and falls back to the empty state when there is no active team', () => {
    mockUseRole.mockReturnValue({ activeTeam: null, loading: false });

    render(<GamesScreen />);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(screen.getByText('No games scheduled.')).toBeTruthy();
  });

  it('shows a loading indicator (not the empty state) while team membership is still resolving', () => {
    mockUseRole.mockReturnValue({ activeTeam: null, loading: true });

    render(<GamesScreen />);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(screen.queryByText('No games scheduled.')).toBeNull();
  });
});
