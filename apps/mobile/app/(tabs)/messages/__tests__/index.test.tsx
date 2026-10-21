import { Q } from '@nozbe/watermelondb';
import { render, screen } from '@testing-library/react-native';

/**
 * The channel list used to query every locally mirrored channel, so a user on
 * two teams saw both teams' channels mixed together. It now follows the
 * active team. As in the Games list test, the seam is the `withObservables`
 * producer: WatermelonDB's native adapter can't run under Jest.
 */

const mockQuery = jest.fn((..._clauses: unknown[]) => ({ observe: () => 'OBSERVABLE' }));
const mockGet = jest.fn((_table: string) => ({ query: mockQuery }));

jest.mock('../../../../src/db', () => ({
  database: { get: (table: string) => mockGet(table) },
}));

let mockCapturedProducer: ((props: { teamId: string }) => unknown) | null = null;
jest.mock('@nozbe/with-observables', () => {
  return (_keys: string[], producer: (props: { teamId: string }) => unknown) => {
    mockCapturedProducer = producer;
    const { Text } = jest.requireActual('react-native');
    return () => ({ teamId }: { teamId: string }) => <Text>channels for {teamId}</Text>;
  };
});

jest.mock('../../../../src/providers/RoleProvider', () => ({ useRole: jest.fn() }));
jest.mock('../../../../src/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));
jest.mock('expo-router', () => ({ __esModule: true, router: { push: jest.fn() } }));

// Required after the mocks so `withObservables` captures the producer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useRole } = require('../../../../src/providers/RoleProvider');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MessagesScreen = require('../index').default;
const mockUseRole = useRole as jest.Mock;

describe('messages/index — team scoping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes the channel query to the given team', () => {
    mockCapturedProducer!({ teamId: 'huskies' });

    expect(mockGet).toHaveBeenCalledWith('channels');
    expect(mockQuery).toHaveBeenCalledWith(Q.where('team_id', 'huskies'), Q.sortBy('channel_type', Q.asc));
  });

  it('renders the active team’s channels', () => {
    mockUseRole.mockReturnValue({ activeTeam: { teamId: 'huskies' }, loading: false });

    render(<MessagesScreen />);

    expect(screen.getByText('channels for huskies')).toBeTruthy();
  });

  it('shows the empty state, not every team’s channels, without an active team', () => {
    mockUseRole.mockReturnValue({ activeTeam: null, loading: false });

    render(<MessagesScreen />);

    expect(screen.getByText('No channels yet.')).toBeTruthy();
  });
});
