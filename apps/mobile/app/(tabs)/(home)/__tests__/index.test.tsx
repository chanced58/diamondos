import { fireEvent, screen } from '@testing-library/react-native';
import { ApiError } from '../../../../src/lib/api-client';
import { renderWithQuery } from '../../../../src/__tests__/render-with-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, router: { push: (...args: unknown[]) => mockPush(...args) } }));
const mockRole = jest.fn();
jest.mock('../../../../src/providers/RoleProvider', () => ({ useRole: () => mockRole() }));
jest.mock('../../../../src/providers/SyncProvider', () => ({ useSyncContext: () => ({ isSyncing: false }) }));
jest.mock('../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));
jest.mock('../../../../src/features/home/ResumeScoringCards', () => {
  const { Text } = jest.requireActual('react-native');
  return { ResumeScoringCards: () => <Text>Resume scoring card</Text> };
});
const mockUseDashboard = jest.fn();
jest.mock('../../../../src/features/home/dashboard-api', () => ({ useDashboard: (...args: unknown[]) => mockUseDashboard(...args) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HomeScreen = require('../index').default;

const TEAM = 't1';
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const dashboard = (extra = {}) => ({
  teamId: TEAM,
  teamName: 'Huskies',
  league: { id: 'l1', name: 'Valley League' },
  view: 'team',
  liveGames: [
    { id: 'live-ours', teamId: TEAM, teamName: 'Huskies', opponentName: 'Eagles', isHome: true, ourScore: 3, theirScore: 1, inning: 4, isTopOfInning: false, outs: 1 },
  ],
  nextGame: { id: 'g-next', teamId: TEAM, opponentName: 'Rams', isHome: false, scheduledAt: soon(2), timeZone: null, venueName: 'Rams Park' },
  upcoming: [
    { kind: 'practice', id: 'p1', teamId: TEAM, date: soon(1), timeZone: null, label: 'Practice', sublabel: '90 min' },
    { kind: 'game', id: 'g-next', teamId: TEAM, date: soon(2), timeZone: null, label: '@ Rams', sublabel: 'Away · Rams Park' },
  ],
  recentGames: [{ id: 'g-old', teamId: TEAM, date: soon(-2), timeZone: null, opponent: 'Owls', isHome: true, ourScore: 6, theirScore: 2 }],
  record: { wins: 1, losses: 0, runsFor: 6, runsAgainst: 2 },
  announcements: [{ id: 'a1', body: 'Bring water', createdAt: soon(-1), senderName: 'Pat Lee', channelName: 'Announcements' }],
  announcementChannelId: 'ann',
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('HomeScreen', () => {
  it('should show a parent the live game, next game, schedule, announcements and results', () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, teamName: 'Huskies', isCoach: false, role: 'parent' }, loading: false });
    mockUseDashboard.mockReturnValue({ data: dashboard({ announcementChannelId: null }) });
    renderWithQuery(<HomeScreen />);

    // A parent follows the live game; only scorers get the resume card.
    expect(screen.queryByText('Resume scoring card')).toBeNull();
    fireEvent.press(screen.getByLabelText('Live: vs Eagles, 3 to 1. Follow live.'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]/live', params: { gameId: 'live-ours' } });

    // In the Next up card and the upcoming list.
    expect(screen.getAllByText('Rams Park', { exact: false })).toHaveLength(2);
    expect(screen.queryByText('Set lineup')).toBeNull();
    expect(screen.getByText('1–0')).toBeTruthy();
    expect(screen.getByText('+4')).toBeTruthy();
    expect(screen.getByText('Bring water')).toBeTruthy();
    expect(screen.queryByText('Post')).toBeNull();

    fireEvent.press(screen.getByText('vs Owls'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]', params: { gameId: 'g-old' } });
    // The row's title (its badge also reads Practice).
    fireEvent.press(screen.getAllByText('Practice')[0]);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: 'p1' } });
  });

  it('should give a coach the resume card, Set lineup and Post, and switch to the league view', () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, teamName: 'Huskies', isCoach: true, role: 'head_coach' }, loading: false });
    mockUseDashboard.mockReturnValue({ data: dashboard() });
    renderWithQuery(<HomeScreen />);

    expect(screen.getByText('Resume scoring card')).toBeTruthy();
    // The coach's own live game is the resume card, not a second card.
    expect(screen.queryByLabelText('Live: vs Eagles, 3 to 1. Follow live.')).toBeNull();

    fireEvent.press(screen.getByText('Set lineup'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]/lineup', params: { gameId: 'g-next' } });
    fireEvent.press(screen.getByText('Post'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/messages/[channelId]', params: { channelId: 'ann' } });

    fireEvent.press(screen.getByText('Valley League'));
    expect(mockUseDashboard).toHaveBeenLastCalledWith(TEAM, 'league');
  });

  it("should keep the scorer's resume card when the dashboard can't load", () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, teamName: 'Huskies', isCoach: false, role: 'scorekeeper' }, loading: false });
    mockUseDashboard.mockReturnValue({ data: undefined, isPending: false, error: new ApiError('offline', 'offline'), refetch: jest.fn() });
    renderWithQuery(<HomeScreen />);
    expect(screen.getByText('Resume scoring card')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});
