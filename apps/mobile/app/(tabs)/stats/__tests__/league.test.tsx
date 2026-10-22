import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LeagueComparisonResponse, LeagueStatsResponse } from '@baseball/shared';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));
jest.mock('../../../../src/providers/RoleProvider', () => ({ useRole: () => ({ activeTeam: { teamId: 't1' } }) }));

const mockUseLeagueStats = jest.fn();
const mockUseLeagueComparison = jest.fn();
jest.mock('../../../../src/features/stats/league-stats-api', () => ({
  useLeagueStats: (teamId: string) => mockUseLeagueStats(teamId),
  useLeagueComparison: (teamId: string) => mockUseLeagueComparison(teamId),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LeagueStatsScreen = require('../league').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TeamComparisonScreen = require('../league-teams').default;

function batter(id: string, name: string, pa: number) {
  return {
    playerId: id, playerName: name, gamesAppeared: 1, plateAppearances: pa, atBats: pa, runs: 0, hits: 1, doubles: 0,
    triples: 0, homeRuns: 0, rbi: 0, walks: 0, strikeouts: 0, hitByPitch: 0, sacrificeFlies: 0, sacrificeHits: 0,
    avg: 1 / pa, obp: 1 / pa, slg: 1 / pa, ops: 2 / pa, iso: 0, babip: null, kPct: 0, bbPct: 0, woba: null,
    battedBalls: 1, hardHitBalls: 0, hardHitPct: 0, qab: 0, qabPct: null,
  };
}

const stats: LeagueStatsResponse = {
  teamId: 't1',
  league: { id: 'l1', name: 'Metro' },
  teamCount: 2,
  gameCount: 12,
  pitching: [],
  batting: [batter('a', 'Luke Fox (Huskies)', 8), batter('b', 'Opp Hitter (Eagles)', 20)],
};

const comparison: LeagueComparisonResponse = {
  teamId: 't1',
  league: { id: 'l1', name: 'Metro' },
  rows: [
    { teamId: 't2', teamName: 'Rams', isOpponentTeam: false, gamesPlayed: 4, wins: 3, losses: 1, ties: 0, runsScored: 20,
      runsAllowed: 10, teamAvg: 0.3, teamEra: 2, totalHits: 30, totalStrikeouts: 20 },
    { teamId: 'o1', teamName: 'Eagles', isOpponentTeam: true, gamesPlayed: 2, wins: 0, losses: 2, ties: 0, runsScored: 3,
      runsAllowed: 12, teamAvg: 0.2, teamEra: 6, totalHits: 8, totalStrikeouts: 5 },
  ],
};

const loaded = <T,>(data: T) => ({ data, isPending: false, isRefetching: false, refetch: jest.fn() });

beforeEach(() => jest.clearAllMocks());

it('should list league hitters by plate appearances, with their teams, and sort by name', () => {
  mockUseLeagueStats.mockReturnValue(loaded(stats));
  render(<LeagueStatsScreen />);

  expect(screen.getByText('2 teams · 12 games')).toBeTruthy();
  const names = () => screen.getAllByText(/\((Huskies|Eagles)\)/).map((n) => n.props.children);
  expect(names()).toEqual(['Opp Hitter (Eagles)', 'Luke Fox (Huskies)']);

  fireEvent.press(screen.getByLabelText('Sort by Batter'));
  expect(names()).toEqual(['Luke Fox (Huskies)', 'Opp Hitter (Eagles)']);

  fireEvent.press(screen.getByText('Team comparison'));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/stats/league-teams');
});

it('should show the free columns only, like the web league page', () => {
  mockUseLeagueStats.mockReturnValue(loaded(stats));
  render(<LeagueStatsScreen />);
  fireEvent.press(screen.getByText('Advanced'));

  expect(screen.getByText('AVG')).toBeTruthy();
  expect(screen.queryByText('OBP')).toBeNull();
});

it('should compare league teams, marking opponent teams', () => {
  mockUseLeagueComparison.mockReturnValue(loaded(comparison));
  render(<TeamComparisonScreen />);

  expect(screen.getByText('Rams')).toBeTruthy();
  expect(screen.getByText('Eagles (opp.)')).toBeTruthy();
  expect(screen.getByText('.750')).toBeTruthy();
});
