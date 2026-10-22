import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SeasonStatsResponse } from '@baseball/shared';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockUseRole = jest.fn();
const mockUseCan = jest.fn();
jest.mock('../../../../src/providers/RoleProvider', () => ({
  useRole: () => mockUseRole(),
  useCan: (capability: string) => mockUseCan(capability),
}));
jest.mock('../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));

const mockUseSeasonStats = jest.fn();
jest.mock('../../../../src/features/stats/season-stats-api', () => ({
  ...jest.requireActual('../../../../src/features/stats/season-stats-api'),
  useSeasonStats: (teamId: string, seasonId?: string) => mockUseSeasonStats(teamId, seasonId),
  // 11 AM on the 21st in Phoenix.
  currentTime: () => new Date('2026-10-21T18:00:00Z'),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const StatsScreen = require('../index').default;

const SEASON = '22222222-2222-4222-8222-222222222222';

function stats(over: Partial<SeasonStatsResponse> = {}): SeasonStatsResponse {
  return {
    teamId: 'team-1',
    seasons: [{ id: SEASON, name: 'Spring', isActive: true }],
    season: { id: SEASON, name: 'Spring' },
    gameCount: 2,
    defaultTier: 'high_school',
    features: { advancedBatting: true, advancedPitching: true, opponents: false },
    hasLeague: false,
    pitching: [
      {
        playerId: 'p1', playerName: 'Luke Fox', gamesAppeared: 1, inningsPitchedOuts: 9, totalPitches: 50, strikes: 30,
        balls: 20, strikePercentage: 0.6, firstPitchStrikes: 5, firstPitchStrikePercentage: 0.5, threeBallCountPAs: 2,
        threeZeroCountPAs: 0, totalPAs: 10, threeBallCountPercentage: 0.2, threeZeroCountPercentage: 0, hitsAllowed: 3,
        runsAllowed: 1, earnedRunsAllowed: 1, walksAllowed: 1, strikeouts: 4, hitBatters: 0, wildPitches: 0, era: 2.33,
        whip: 1.33, strikeoutsPerSeven: 9.33, walksPerSeven: 2.33, baByCount: {},
        compliance: { pitchCount: 50, requiredRestDays: 2, canPitchNextDay: false, lastGameDate: '2026-10-20', timeZone: 'America/Phoenix', pitches7d: 50 },
      },
    ],
    batting: [],
    catcher: [],
    opponents: null,
    missingWaiverCount: 0,
    ...over,
  };
}

function given(data: SeasonStatsResponse, { coach = false } = {}) {
  mockUseSeasonStats.mockReturnValue({ data, isPending: false, isRefetching: false, refetch: jest.fn() });
  mockUseCan.mockImplementation((capability: string) => capability === 'team.coach' && coach);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRole.mockReturnValue({ activeTeam: { teamId: 'team-1' } });
});

it("should show the active season's pitchers with their rest, and open a pitcher's detail", () => {
  given(stats());
  render(<StatsScreen />);

  expect(screen.getByText('Spring · 2 games')).toBeTruthy();
  expect(screen.getByText('2d')).toBeTruthy();
  fireEvent.press(screen.getByText('Luke Fox'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/stats/pitcher/[playerId]', params: { playerId: 'p1' } });
});

it('should load every game when All games is picked', () => {
  given(stats());
  render(<StatsScreen />);

  fireEvent.press(screen.getByText('All games'));
  expect(mockUseSeasonStats).toHaveBeenLastCalledWith('team-1', 'all');
});

it('should offer the bullpen planner to coaches only', () => {
  given(stats());
  const { unmount } = render(<StatsScreen />);
  expect(screen.queryByText('Bullpen planner')).toBeNull();
  unmount();

  given(stats(), { coach: true });
  render(<StatsScreen />);
  fireEvent.press(screen.getByText('Bullpen planner'));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/stats/bullpen');
});

it('should show the Opponents tab only on plans with opponent tracking', () => {
  given(stats());
  const { unmount } = render(<StatsScreen />);
  expect(screen.queryByText('Opponents')).toBeNull();
  unmount();

  given(stats({
    features: { advancedBatting: true, advancedPitching: true, opponents: true },
    opponents: [{ teamId: 'o1', teamName: 'Eagles', gamesPlayed: 2, wins: 1, losses: 1, ties: 0, batting: [], pitching: [] }],
  }));
  render(<StatsScreen />);
  fireEvent.press(screen.getByText('Opponents'));
  expect(screen.getByText('1-1')).toBeTruthy();
  fireEvent.press(screen.getByText('Eagles'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/stats/opponent/[opponentTeamId]',
    params: { opponentTeamId: 'o1' },
  });
});

it('should sort the pitching table it falls back to when Opponents leaves the plan', () => {
  const withOpponents = stats({ features: { advancedBatting: true, advancedPitching: true, opponents: true }, opponents: [] });
  given(withOpponents);
  const { rerender } = render(<StatsScreen />);
  fireEvent.press(screen.getByText('Opponents'));

  // Switching to a team without opponent tracking shows Pitching again.
  given(stats());
  rerender(<StatsScreen />);
  fireEvent.press(screen.getByLabelText('Sort by Pitcher'));
  expect(screen.getByText('Pitcher ↑')).toBeTruthy();
});

it('should point to the roster when active players are missing a waiver', () => {
  given(stats({ missingWaiverCount: 2 }));
  render(<StatsScreen />);

  fireEvent.press(screen.getByText('Review roster ›'));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/roster');
});
