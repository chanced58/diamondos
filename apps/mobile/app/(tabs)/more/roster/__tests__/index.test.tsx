import { Q } from '@nozbe/watermelondb';
import { render, screen } from '@testing-library/react-native';

/**
 * The roster used to merge the players of every team the user belongs to
 * (derived from synced games and channels). It now shows the active team's.
 */

const mockQuery = jest.fn((..._clauses: unknown[]) => ({
  observe: () => ({
    subscribe: ({ next }: { next: (players: unknown[]) => void }) => {
      next([{ id: 'p1', fullName: 'Alex Kim', jerseyNumber: 7, primaryPosition: undefined }]);
      return { unsubscribe: jest.fn() };
    },
  }),
}));

jest.mock('../../../../../src/db', () => ({
  database: { get: () => ({ query: mockQuery }) },
}));
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: jest.fn() }));
jest.mock('../../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useRole } = require('../../../../../src/providers/RoleProvider');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RosterScreen = require('../index').default;
const mockUseRole = useRole as jest.Mock;

describe('more/roster — team scoping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries only the active team’s active players', () => {
    mockUseRole.mockReturnValue({ activeTeam: { teamId: 'huskies' }, loading: false });

    render(<RosterScreen />);

    expect(mockQuery).toHaveBeenCalledWith(
      Q.where('team_id', 'huskies'),
      Q.where('is_active', true),
      Q.sortBy('last_name', Q.asc),
    );
    expect(screen.getByText('Alex Kim')).toBeTruthy();
  });

  it('runs no players query without an active team', () => {
    mockUseRole.mockReturnValue({ activeTeam: null, loading: false });

    render(<RosterScreen />);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(screen.getByText('No players loaded yet.')).toBeTruthy();
  });
});
