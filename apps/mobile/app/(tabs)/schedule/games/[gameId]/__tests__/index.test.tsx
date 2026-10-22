import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { GameDetailResponse } from '@baseball/shared';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ gameId: 'game-1' }),
  // Render the header's right button so tests can press it.
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => JSX.Element } }) => options?.headerRight?.() ?? null },
}));

const mockUseRole = jest.fn();
jest.mock('../../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockUseRole() }));

const mockUseGameRsvps = jest.fn();
jest.mock('../../../../../../src/features/rsvp/useGameRsvps', () => ({
  useGameRsvps: (ids: string[]) => mockUseGameRsvps(ids),
}));

const mockUseGameDetail = jest.fn();
const mutation = () => ({ mutate: jest.fn(), isPending: false });
let mockActions = { cancel: mutation(), reset: mutation(), recalculate: mutation(), override: mutation() };
jest.mock('../../../../../../src/features/games/use-game-detail', () => ({
  useGameDetail: (id: string) => mockUseGameDetail(id),
  useGameActions: () => mockActions,
}));

const mockOpenOnWeb = jest.fn();
jest.mock('../../../../../../src/lib/web-links', () => ({
  webUrl: () => 'https://app.example.com/',
  openOnWeb: (path: string) => mockOpenOnWeb(path),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GameDetailScreen = require('../index').default;

function detail(overrides: Partial<GameDetailResponse['game']> = {}, isCoach = false): GameDetailResponse {
  return {
    game: {
      id: 'game-1',
      teamId: 'team-1',
      status: 'scheduled',
      opponentName: 'Eagles',
      opponentTeamId: null,
      scheduledAt: '2026-10-20T23:00:00.000Z',
      timeZone: 'America/Chicago',
      locationType: 'home',
      neutralHomeTeam: null,
      venueName: 'Field 2',
      venueAddress: null,
      placeId: null,
      notes: null,
      homeScore: 0,
      awayScore: 0,
      currentInning: null,
      latitude: null,
      longitude: null,
      tournamentId: null,
      ...overrides,
    },
    viewer: { isCoach },
    hasLineup: true,
    hasOpponentLineup: false,
    takeaways: null,
    reconciliation: null,
  };
}

function givenDetail(data: GameDetailResponse, role = 'player') {
  mockUseGameDetail.mockReturnValue({ data, isPending: false, isRefetching: false, refetch: jest.fn() });
  mockUseRole.mockReturnValue({ memberships: [{ teamId: 'team-1', role }] });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockActions = { cancel: mutation(), reset: mutation(), recalculate: mutation(), override: mutation() };
  mockUseGameRsvps.mockReturnValue({
    myPlayers: [], rsvpByKey: new Map(), savingKeys: new Set(), setRsvp: jest.fn(), error: null,
  });
});

it('should show an error with retry when the game cannot be loaded', () => {
  const refetch = jest.fn();
  mockUseGameDetail.mockReturnValue({ data: undefined, isPending: false, error: new Error('x'), refetch });
  mockUseRole.mockReturnValue({ memberships: [] });

  render(<GameDetailScreen />);
  fireEvent.press(screen.getByText('Try again'));

  expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
  expect(refetch).toHaveBeenCalled();
});

it('should let a player RSVP but not score or run coach actions', () => {
  givenDetail(detail());
  mockUseGameRsvps.mockReturnValue({
    myPlayers: [{ playerId: 'p1', playerName: 'Sam Lee' }],
    rsvpByKey: new Map(), savingKeys: new Set(), setRsvp: jest.fn(), error: null,
  });

  render(<GameDetailScreen />);

  expect(screen.getByText('vs Eagles', { exact: true })).toBeTruthy();
  expect(mockUseGameRsvps).toHaveBeenCalledWith(['game-1']);
  expect(screen.getByLabelText('Sam Lee: Going')).toBeTruthy();
  expect(screen.queryByText('Score this game')).toBeNull();
  expect(screen.queryByText('Danger zone')).toBeNull();
});

it('should open the scorer for a coach with the scorer params', () => {
  givenDetail(detail({}, true), 'head_coach');

  render(<GameDetailScreen />);
  fireEvent.press(screen.getByText('Score this game'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/schedule/games/[gameId]/score',
    params: { gameId: 'game-1', teamId: 'team-1', opponentName: 'Eagles' },
  });
});

it('should send a parent following a live game to the live viewer, not the scorer', () => {
  givenDetail(detail({ status: 'in_progress' }), 'parent');

  render(<GameDetailScreen />);
  fireEvent.press(screen.getByText('Follow live'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]/live', params: { gameId: 'game-1' } });

  fireEvent.press(screen.getByText('Live view'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]/live', params: { gameId: 'game-1' } });
});

it('should keep a coach on the scorer for a live game, with the live view a row away', () => {
  givenDetail(detail({ status: 'in_progress' }, true), 'head_coach');

  render(<GameDetailScreen />);
  fireEvent.press(screen.getByText('Continue scoring'));
  expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ pathname: '/(tabs)/schedule/games/[gameId]/score' }));
  expect(screen.getByText('Live view')).toBeTruthy();
});

it('should let the team scorekeeper start scoring without coach actions', () => {
  givenDetail(detail(), 'scorekeeper');

  render(<GameDetailScreen />);

  expect(screen.getByText('Score this game')).toBeTruthy();
  expect(screen.queryByText('Cancel game')).toBeNull();
});

it('should cancel and notify the team only after the coach confirms', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  givenDetail(detail({}, true), 'head_coach');

  render(<GameDetailScreen />);
  fireEvent.press(screen.getByText('Cancel game'));

  expect(mockActions.cancel.mutate).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === 'Cancel and notify team')?.onPress?.();
  expect(mockActions.cancel.mutate).toHaveBeenCalledWith(true, expect.any(Object));
  alert.mockRestore();
});

it('should show takeaways and a reset for a coach on a completed game', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  givenDetail(
    {
      ...detail({ status: 'completed', homeScore: 2, awayScore: 5 }, true),
      takeaways: {
        lostGame: true,
        unavailable: false,
        items: [{ code: 'k', label: 'Too many strikeouts', description: 'd', severity: 'high', metric: '9 K' }],
      },
    },
    'head_coach',
  );

  render(<GameDetailScreen />);

  expect(screen.getByText('What cost us runs')).toBeTruthy();
  expect(screen.getByText('Too many strikeouts')).toBeTruthy();
  fireEvent.press(screen.getByText('Reset game'));
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === 'Reset game')?.onPress?.();
  expect(mockActions.reset.mutate).toHaveBeenCalled();
  alert.mockRestore();
});

it('should not recalculate the stored score until the coach confirms', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  givenDetail(detail({ status: 'completed' }, true), 'head_coach');

  render(<GameDetailScreen />);
  fireEvent.press(screen.getByText('Recalculate score from play-by-play'));

  // A stray tap only opens the confirmation; nothing is written yet.
  expect(mockActions.recalculate.mutate).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === 'Keep score')?.onPress?.();
  expect(mockActions.recalculate.mutate).not.toHaveBeenCalled();
  buttons.find((b) => b.text === 'Recalculate')?.onPress?.();
  expect(mockActions.recalculate.mutate).toHaveBeenCalled();
  alert.mockRestore();
});

it('should let the home coach accept the away value for a conflict', () => {
  givenDetail(
    {
      ...detail({ status: 'completed' }, true),
      reconciliation: {
        reconciliationId: 'recon-1',
        homeTeamLabel: 'Huskies',
        awayTeamLabel: 'Eagles',
        canOverride: true,
        conflicts: [{ key: 'final_score:home', label: 'Final score — home runs', homeLog: 2, awayLog: 3, overridden: false }],
      },
    },
    'head_coach',
  );

  render(<GameDetailScreen />);
  fireEvent.press(screen.getByText('Use Eagles value'));

  expect(mockActions.override.mutate).toHaveBeenCalledWith(
    { reconciliationId: 'recon-1', conflictKey: 'final_score:home', useAwayValue: true },
    expect.any(Object),
  );
});

it('should open the game pages in the app, not on the web', () => {
  givenDetail(detail({ status: 'completed' }, true), 'head_coach');

  render(<GameDetailScreen />);
  for (const [title, page] of [
    ['Box score', 'box-score'],
    ['Play-by-play', 'history'],
    ['Game notes', 'notes'],
    ['Opponent lineup', 'opponent-lineup'],
  ]) {
    fireEvent.press(screen.getByText(title));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: `/(tabs)/schedule/games/[gameId]/${page}`, params: { gameId: 'game-1' } });
  }
  expect(screen.queryByText('Opens on the web')).toBeNull();
  expect(mockOpenOnWeb).not.toHaveBeenCalled();
});

it('should keep stats and play-by-play off a game that has not started', () => {
  givenDetail(detail({}, true), 'head_coach');
  render(<GameDetailScreen />);
  expect(screen.queryByText('Box score')).toBeNull();
  expect(screen.queryByText('Play-by-play')).toBeNull();
  expect(screen.getByText('Game notes')).toBeTruthy();
});

it('should give coaches a native Edit button instead of a web link', () => {
  givenDetail(detail({}, true), 'head_coach');

  render(<GameDetailScreen />);
  fireEvent.press(screen.getByLabelText('Edit game'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]/edit', params: { gameId: 'game-1' } });
  // The old "Edit game · Opens on the web" row is gone (the header button reads "Edit").
  expect(screen.queryByText('Edit game')).toBeNull();
});

it('should not offer players an Edit button', () => {
  givenDetail(detail());
  render(<GameDetailScreen />);
  expect(screen.queryByLabelText('Edit game')).toBeNull();
});
