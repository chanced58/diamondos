import { Q } from '@nozbe/watermelondb';
import { fireEvent, render, screen } from '@testing-library/react-native';

/**
 * The roster shows the active team's players from the offline mirror. Coaches
 * and staff open any player, a player their own page; coaches also add
 * players and see the disabled ones.
 */

const ACTIVE = [
  { id: 'l1', remoteId: 'p1', fullName: 'Alex Kim', jerseyNumber: 7, primaryPosition: undefined },
  { id: 'l2', remoteId: 'p2', fullName: 'Bo Diaz', jerseyNumber: undefined, primaryPosition: 'shortstop' },
];
const DISABLED = [{ id: 'l3', remoteId: 'p3', fullName: 'Cy Old', jerseyNumber: undefined, primaryPosition: undefined }];

const mockQuery = jest.fn((...clauses: unknown[]) => ({
  observe: () => ({
    subscribe: ({ next }: { next: (players: unknown[]) => void }) => {
      const wantsActive = JSON.stringify(clauses).includes(JSON.stringify(Q.where('is_active', true)));
      next(wantsActive ? ACTIVE : DISABLED);
      return { unsubscribe: jest.fn() };
    },
  }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null },
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
const team = (extra = {}) => ({ activeTeam: { teamId: 'huskies', role: 'parent', isCoach: false, ...extra }, loading: false });

describe('more/roster', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries only the active team’s players, active and disabled', () => {
    mockUseRole.mockReturnValue(team());
    render(<RosterScreen />);

    expect(mockQuery).toHaveBeenCalledWith(Q.where('team_id', 'huskies'), Q.where('is_active', true), Q.sortBy('last_name', Q.asc));
    expect(mockQuery).toHaveBeenCalledWith(Q.where('team_id', 'huskies'), Q.where('is_active', false), Q.sortBy('last_name', Q.asc));
    expect(screen.getByText('Alex Kim')).toBeTruthy();
  });

  it('runs no players query without an active team', () => {
    mockUseRole.mockReturnValue({ activeTeam: null, loading: false });
    render(<RosterScreen />);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(screen.getByText('No players loaded yet.')).toBeTruthy();
  });

  it('lets a coach open any player, add one, and show the disabled players', () => {
    mockUseRole.mockReturnValue(team({ role: 'head_coach', isCoach: true }));
    render(<RosterScreen />);

    fireEvent.press(screen.getByLabelText('Open Bo Diaz'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/roster/[playerId]', params: { playerId: 'p2' } });

    fireEvent.press(screen.getByLabelText('Add player'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/roster/new');

    expect(screen.queryByText('Cy Old')).toBeNull();
    fireEvent.press(screen.getByText('Disabled players (1)'));
    expect(screen.getByText('Cy Old')).toBeTruthy();
  });

  it('lets a player open only their own page, with no coach controls', () => {
    mockUseRole.mockReturnValue(team({ role: 'player', playerId: 'p1' }));
    render(<RosterScreen />);

    expect(screen.getByLabelText('Open Alex Kim')).toBeTruthy();
    expect(screen.queryByLabelText('Open Bo Diaz')).toBeNull();
    expect(screen.queryByLabelText('Add player')).toBeNull();
    expect(screen.queryByText('Disabled players (1)')).toBeNull();
  });

  it('lets scorekeepers open every player, and parents none', () => {
    mockUseRole.mockReturnValue(team({ role: 'scorekeeper' }));
    const { unmount } = render(<RosterScreen />);
    expect(screen.getByLabelText('Open Bo Diaz')).toBeTruthy();
    unmount();

    mockUseRole.mockReturnValue(team({ role: 'parent' }));
    render(<RosterScreen />);
    expect(screen.queryByLabelText('Open Alex Kim')).toBeNull();
  });
});
