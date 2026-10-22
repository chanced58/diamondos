import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OpponentTeamDetailResponse, OpponentTeamsResponse, ScoutingCardResponse } from '@baseball/shared';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ opponentTeamId: 'o1' }),
  Stack: { Screen: () => null },
}));

const mockUseCan = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({
  useRole: () => ({ activeTeam: { teamId: 't1' } }),
  useCan: (capability: string) => mockUseCan(capability),
}));
jest.mock('../../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));

const mockApi = {
  useOpponentTeams: jest.fn(),
  useOpponentTeam: jest.fn(),
  useScoutingCard: jest.fn(),
  addOpponentTeamPlayer: jest.fn(),
  updateOpponentTeamPlayer: jest.fn(),
  removeOpponentTeamPlayer: jest.fn(),
  generateScoutingCard: jest.fn(),
};
jest.mock('../../../../../src/features/opponents/opponent-teams-api', () => ({
  ...jest.requireActual('../../../../../src/features/opponents/opponent-teams-api'),
  useOpponentTeams: (...args: unknown[]) => mockApi.useOpponentTeams(...args),
  useOpponentTeam: (...args: unknown[]) => mockApi.useOpponentTeam(...args),
  useScoutingCard: (...args: unknown[]) => mockApi.useScoutingCard(...args),
  addOpponentTeamPlayer: (...args: unknown[]) => mockApi.addOpponentTeamPlayer(...args),
  updateOpponentTeamPlayer: (...args: unknown[]) => mockApi.updateOpponentTeamPlayer(...args),
  removeOpponentTeamPlayer: (...args: unknown[]) => mockApi.removeOpponentTeamPlayer(...args),
  generateScoutingCard: (...args: unknown[]) => mockApi.generateScoutingCard(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const OpponentTeamsScreen = require('../index').default;
const OpponentTeamScreen = require('../[opponentTeamId]/index').default;
const ScoutingCardScreen = require('../[opponentTeamId]/card').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const loaded = <T,>(data: T) => ({ data, isPending: false, isRefetching: false, refetch: jest.fn() });

function renderWithQueries(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const team = { id: 'o1', name: 'Eagles', abbreviation: 'EAG', city: 'Boise', stateCode: 'ID' };
const detail: OpponentTeamDetailResponse = {
  team,
  priorGames: 2,
  players: [
    { id: 'p1', firstName: 'X', lastName: 'Kling', jerseyNumber: '7', primaryPosition: 'shortstop', bats: 'left', throws: 'right' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCan.mockImplementation((capability: string) => capability === 'team.coach');
});

describe('opponent teams list', () => {
  it('should list the team’s opponents with roster sizes and open one', () => {
    const list: OpponentTeamsResponse = { teamId: 't1', opponentTeams: [{ ...team, playerCount: 1 }] };
    mockApi.useOpponentTeams.mockReturnValue(loaded(list));
    renderWithQueries(<OpponentTeamsScreen />);

    expect(screen.getByText('Eagles (EAG)')).toBeTruthy();
    expect(screen.getByText('Boise, ID · 1 player')).toBeTruthy();
    fireEvent.press(screen.getByText('Eagles (EAG)'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/opponents/[opponentTeamId]', params: { opponentTeamId: 'o1' } });
  });

  it('should not load opponents for a non-coach', () => {
    mockUseCan.mockReturnValue(false);
    mockApi.useOpponentTeams.mockReturnValue({ data: undefined, isPending: true });
    renderWithQueries(<OpponentTeamsScreen />);

    expect(screen.getByText('Only coaches can manage opponent teams.')).toBeTruthy();
    expect(mockApi.useOpponentTeams).toHaveBeenLastCalledWith(undefined);
  });
});

describe('opponent team roster', () => {
  it('should add a player with bats and throws', async () => {
    mockApi.useOpponentTeam.mockReturnValue(loaded(detail));
    mockApi.addOpponentTeamPlayer.mockResolvedValue({ playerId: 'p2' });
    renderWithQueries(<OpponentTeamScreen />);

    expect(screen.getByText('#7 X Kling')).toBeTruthy();
    expect(screen.getByText('SS · L/R')).toBeTruthy();

    fireEvent.press(screen.getByText('Add player'));
    fireEvent.changeText(screen.getByLabelText('First name'), 'Jo');
    fireEvent.changeText(screen.getByLabelText('Last name'), 'Pine');
    fireEvent.press(screen.getByLabelText('Bats S'));
    fireEvent.press(screen.getByLabelText('Throws L'));
    await act(async () => {
      fireEvent.press(screen.getAllByText('Add player').at(-1)!);
    });

    await waitFor(() =>
      expect(mockApi.addOpponentTeamPlayer).toHaveBeenCalledWith('o1', {
        firstName: 'Jo', lastName: 'Pine', jerseyNumber: null, primaryPosition: null, bats: 'switch', throws: 'left',
      }),
    );
  });

  it('should remove a player after confirming', async () => {
    mockApi.useOpponentTeam.mockReturnValue(loaded(detail));
    mockApi.removeOpponentTeamPlayer.mockResolvedValue({ playerId: 'p1' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    renderWithQueries(<OpponentTeamScreen />);

    await act(async () => {
      fireEvent(screen.getByText('#7 X Kling'), 'longPress');
    });
    expect(alert).toHaveBeenCalledWith('Remove X Kling?', 'Their recorded stats stay.', expect.any(Array));
    await waitFor(() => expect(mockApi.removeOpponentTeamPlayer).toHaveBeenCalledWith('o1', 'p1'));
  });
});

describe('scouting card', () => {
  const card = {
    id: 'c1', opponentTeamId: 'o1', teamId: 't1', gameSampleCount: 2, model: 'claude', generatedAt: '2026-10-21T18:00:00Z',
    hitterStats: [{ opponentPlayerId: '33333333-3333-4333-8333-333333333333', displayName: 'X Kling', pa: 8, ab: 7, h: 3,
      hr: 0, k: 1, bb: 1, avg: '.429', obp: '.500', slg: '.571', ops: '1.071' }],
    pitcherStats: [],
    aiCard: {
      oneLineSummary: 'Make them earn it.',
      teamTendencies: { bullets: ['Aggressive early in counts.'] },
      pitcherTendencies: [],
      hitterProfiles: [{ opponentPlayerId: '33333333-3333-4333-8333-333333333333', approach: 'Pull hitter.',
        howToPitchThem: 'Away, away.', stealRisk: 'high' as const, buntRisk: 'low' as const, hotZones: [1, 4], coldZones: [9] }],
      keyMatchups: [],
    },
  };

  it('should explain why there is nothing to generate without prior games', () => {
    mockApi.useScoutingCard.mockReturnValue(loaded<ScoutingCardResponse>({ opponentTeam: team, priorGames: 0, card: null }));
    renderWithQueries(<ScoutingCardScreen />);

    expect(screen.getByText('No prior games on record')).toBeTruthy();
    expect(screen.queryByText('Generate card')).toBeNull();
  });

  it('should show the card with its takeaway and zones, and regenerate it', async () => {
    mockApi.useScoutingCard.mockReturnValue(loaded<ScoutingCardResponse>({ opponentTeam: team, priorGames: 2, card }));
    mockApi.generateScoutingCard.mockResolvedValue({ card });
    renderWithQueries(<ScoutingCardScreen />);

    expect(screen.getByText('Make them earn it.')).toBeTruthy();
    expect(screen.getByText('• Aggressive early in counts.')).toBeTruthy();
    expect(screen.getByLabelText('Hot zones: 1, 4')).toBeTruthy();
    expect(screen.getByText('.429/.500/.571 · OPS 1.071 · PA 8')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Regenerate card'));
    });
    await waitFor(() => expect(mockApi.generateScoutingCard).toHaveBeenCalledWith('o1'));
  });
});
