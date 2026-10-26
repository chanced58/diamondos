import { fireEvent, screen } from '@testing-library/react-native';
import { ApiError } from '../../../../../src/lib/api-client';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockPush = jest.fn();
const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams(),
}));
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => ({ activeTeam: { teamId: 'mine' } }) }));
const mockUseHome = jest.fn();
const mockUseTeam = jest.fn();
jest.mock('../../../../../src/features/league/league-home-api', () => ({
  useLeagueHome: (...args: unknown[]) => mockUseHome(...args),
  useLeagueTeam: (...args: unknown[]) => mockUseTeam(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const LeagueHomeScreen = require('../home').default;
const LeagueTeamScreen = require('../team/[teamId]').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const standing = (teamId: string | null, name: string) => ({ teamId, name, wins: 3, losses: 1, ties: 0, winPct: 0.75, runsFor: 20, runsAgainst: 10 });
const home = (extra = {}) => ({
  slug: 'idaho-2a',
  league: { id: 'l1', name: 'Idaho 2A', logoUrl: null },
  sections: ['hero', 'standings', 'leaders', 'recent', 'spotlights'],
  season: '2026',
  seasons: ['2026', '2025'],
  counters: { teams: 2, games: 4 },
  updatedAt: null,
  standings: [standing('t1', 'Huskies'), standing(null, 'Eagles')],
  divisions: [],
  leaders: {
    batting: [{ key: 'avg', label: 'AVG', rows: [{ id: 'p1', rank: 1, name: 'Ann Coit', teamName: 'Huskies', teamId: 't1', display: '.412', ours: true }] }],
    pitching: [],
    team: [{ key: 'teamEra', label: 'Team ERA', rows: [{ id: 't2', rank: 1, name: 'Rams', teamName: null, teamId: 't2', display: '2.50', ours: false }] }],
    special: [],
  },
  spotlights: [{ kind: 'team', subjectName: 'Rams', subjectTeamId: 't2', teamName: null, teamId: null, blurb: 'Won 5 straight' }],
  recent: [{ id: 'g1', teamName: 'Huskies', teamId: 't1', opponent: 'Rams', ourScore: 5, theirScore: 2, result: 'W' }],
  upcoming: [{ id: 'g2', label: 'Huskies vs Rams — Nov 1' }],
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('LeagueHomeScreen', () => {
  it("should show the league's sections and open a team's page", () => {
    mockParams.mockReturnValue({ slug: 'idaho-2a' });
    mockUseHome.mockReturnValue({ data: home() });
    renderWithQuery(<LeagueHomeScreen />);

    expect(mockUseHome).toHaveBeenCalledWith('idaho-2a', undefined, 'mine');
    expect(screen.getByText('2 teams · 4 games · 2026')).toBeTruthy();
    expect(screen.getByText('.412')).toBeTruthy();
    expect(screen.getByText('Won 5 straight')).toBeTruthy();
    expect(screen.getByText('Huskies vs Rams — Nov 1')).toBeTruthy();

    fireEvent.press(screen.getAllByText('Huskies')[0]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/league/team/[teamId]', params: { teamId: 't1', slug: 'idaho-2a', season: '2026' } });

    // A league opponent has no page.
    mockPush.mockClear();
    fireEvent.press(screen.getByText('Eagles'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should switch leader tabs and seasons', () => {
    mockParams.mockReturnValue({ slug: 'idaho-2a' });
    mockUseHome.mockReturnValue({ data: home() });
    renderWithQuery(<LeagueHomeScreen />);

    fireEvent.press(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.getByText('2.50')).toBeTruthy();
    fireEvent.press(screen.getByText('2025'));
    expect(mockUseHome).toHaveBeenLastCalledWith('idaho-2a', '2025', 'mine');
  });

  it('should say when the league is not found', () => {
    mockParams.mockReturnValue({ slug: 'nope' });
    mockUseHome.mockReturnValue({ data: undefined, isPending: false, error: new ApiError('not_found', 'League not found.') });
    renderWithQuery(<LeagueHomeScreen />);
    expect(screen.getByText('League not found')).toBeTruthy();
  });
});

describe('LeagueTeamScreen', () => {
  it("should show the team's record, stats and players, hidden stats last", () => {
    mockParams.mockReturnValue({ slug: 'idaho-2a', teamId: 't1', season: '2026' });
    mockUseTeam.mockReturnValue({
      data: {
        slug: 'idaho-2a',
        league: { id: 'l1', name: 'Idaho 2A' },
        season: '2026',
        team: { id: 't1', name: 'Huskies', logoUrl: null },
        record: { wins: 3, losses: 1, ties: 0, winPct: 0.75, runsFor: 20, runsAgainst: 10 },
        rank: { rank: 1, total: 6 },
        divisionName: 'North',
        teamStats: [{ key: 'teamAvg', label: 'Team AVG', display: '.300' }],
        batting: {
          columns: [{ key: 'pa', label: 'PA', sortDir: 'desc' }],
          rows: [
            { playerId: 'h', name: 'Hal', optedOut: true, cells: { pa: { value: null, display: '—' } } },
            { playerId: 'a', name: 'Ann', optedOut: false, cells: { pa: { value: 10, display: '10' } } },
          ],
        },
        pitching: { columns: [{ key: 'ip', label: 'IP', sortDir: 'desc' }], rows: [] },
      },
    });
    renderWithQuery(<LeagueTeamScreen />);

    expect(mockUseTeam).toHaveBeenCalledWith('idaho-2a', 't1', '2026');
    expect(screen.getByText('#1 of 6 · North · 20 RF · 10 RA')).toBeTruthy();
    expect(screen.getByText('.300')).toBeTruthy();
    const names = screen.getAllByText(/^(Ann|Hal)$/).map((node) => node.props.children);
    expect(names).toEqual(['Ann', 'Hal']);
    expect(screen.queryByText('Pitching')).toBeNull();
  });
});
