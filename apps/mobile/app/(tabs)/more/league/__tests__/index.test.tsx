import { fireEvent, screen } from '@testing-library/react-native';
import { ApiError } from '../../../../../src/lib/api-client';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));
const mockCan = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({
  useRole: () => ({ activeTeam: { teamId: 't1' } }),
  useCan: (capability: string) => mockCan(capability),
}));
jest.mock('../../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));
const mockOpenOnWeb = jest.fn();
jest.mock('../../../../../src/lib/web-links', () => ({
  webUrl: () => 'https://example.com/',
  openOnWeb: (...args: unknown[]) => mockOpenOnWeb(...args),
}));
const mockUseLeaguePage = jest.fn();
jest.mock('../../../../../src/features/league/league-api', () => ({ useLeaguePage: (...args: unknown[]) => mockUseLeaguePage(...args) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LeagueScreen = require('../index').default;

const team = (name: string, overrides = {}) => ({
  key: name, name, organization: null, teamId: null, isActive: false, isOpponent: false,
  wins: 0, losses: 0, ties: 0, pct: 0, rf: 0, ra: 0, diff: 0, gamesPlayed: 0, last5: [], streak: null, ...overrides,
});
const page = (extra = {}) => ({
  league: { id: 'l1', name: 'Idaho 2A', description: 'Small schools', slug: 'idaho-2a' },
  counters: { teams: 2, divisions: 1, gamesPlayed: 4, yourRank: 1 },
  divisions: [{
    id: 'd1',
    name: 'North',
    teams: [
      team('Rams', { wins: 1, losses: 2, pct: 1 / 3, gamesPlayed: 3, diff: -4 }),
      team('Huskies', { isActive: true, teamId: 't1', wins: 3, losses: 1, pct: 0.75, gamesPlayed: 4, diff: 9, streak: { type: 'W', count: 2 }, last5: ['W', 'L', 'W', 'W'] }),
    ],
  }],
  staff: [{ id: 's1', name: 'Ada Ng', role: 'league_admin' }],
  isLeagueAdmin: false,
  colorScheme: 'classic',
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCan.mockReturnValue(true);
});

describe('LeagueScreen', () => {
  it('should show the counters, the standings best first with your team marked, and the staff', () => {
    mockUseLeaguePage.mockReturnValue({ data: page() });
    renderWithQuery(<LeagueScreen />);

    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('Huskies (you)')).toBeTruthy();
    expect(screen.getByText('.750')).toBeTruthy();
    expect(screen.getByText('W2')).toBeTruthy();
    expect(screen.getByText('Ada Ng')).toBeTruthy();
    // Best win percentage first.
    const names = screen.getAllByText(/^(Huskies \(you\)|Rams)$/).map((node) => node.props.children);
    expect(names).toEqual(['Huskies (you)', 'Rams']);

    fireEvent.press(screen.getByText('League home: leaders and results'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/league/home', params: { slug: 'idaho-2a' } });
    expect(mockOpenOnWeb).not.toHaveBeenCalled();
    expect(screen.queryByText('Manage the league on the web')).toBeNull();
  });

  it('should offer league admins the web admin', () => {
    mockUseLeaguePage.mockReturnValue({ data: page({ isLeagueAdmin: true }) });
    renderWithQuery(<LeagueScreen />);
    fireEvent.press(screen.getByText('Manage the league on the web'));
    expect(mockOpenOnWeb).toHaveBeenCalledWith('/league/admin');
  });

  it("should not load the league for a team whose plan lacks league management", () => {
    mockCan.mockReturnValue(false);
    mockUseLeaguePage.mockReturnValue({ data: undefined, isPending: true });
    renderWithQuery(<LeagueScreen />);
    expect(mockCan).toHaveBeenCalledWith('league_management');
    expect(mockUseLeaguePage).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('The league page is on plans with league management.')).toBeTruthy();
  });

  it('should say when a refresh fails, keeping the standings on screen', () => {
    const refetch = jest.fn();
    mockUseLeaguePage.mockReturnValue({ data: page(), isRefetchError: true, error: new ApiError('offline', 'offline'), refetch });
    renderWithQuery(<LeagueScreen />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Huskies (you)')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('should say when the team is in no league', () => {
    mockUseLeaguePage.mockReturnValue({ data: undefined, isPending: false, error: new ApiError('not_found', 'This team is not in a league.') });
    renderWithQuery(<LeagueScreen />);
    expect(screen.getByText('No league')).toBeTruthy();
  });
});
