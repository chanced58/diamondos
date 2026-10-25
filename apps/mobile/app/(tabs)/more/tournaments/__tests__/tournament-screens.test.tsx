import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args) },
  // Render the header's right button so tests can press it.
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => JSX.Element } }) => options?.headerRight?.() ?? null },
  useLocalSearchParams: () => mockParams(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '99999999-9999-4999-8999-999999999999' }));
jest.mock('../../../../../src/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const mockTriggerSync = jest.fn();
jest.mock('../../../../../src/providers/SyncProvider', () => ({ useSyncContext: () => ({ triggerSync: mockTriggerSync }) }));
jest.mock('../../../../../src/features/forms/DateTimeFields', () => ({ DateTimeFields: () => null }));
const mockUseTournaments = jest.fn();
const mockUseTournament = jest.fn();
const mockUseTeamOptions = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../../../../src/features/tournaments/tournaments-api', () => ({
  tournamentsQueryKey: ['tournaments'],
  useTournaments: () => mockUseTournaments(),
  useTournament: (...args: unknown[]) => mockUseTournament(...args),
  useTournamentTeamOptions: (...args: unknown[]) => mockUseTeamOptions(...args),
  createTournament: (...args: unknown[]) => mockCreate(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const TournamentsScreen = require('../index').default;
const NewTournamentScreen = require('../new').default;
const TournamentScreen = require('../[tournamentId]').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const TEAM = '22222222-2222-4222-8222-222222222222';
const detail = (extra = {}) => ({
  tournament: { id: 'tr1', name: 'Fall Classic', startDate: '2026-10-30', endDate: '2026-11-01', status: 'active' },
  team: { id: TEAM, name: 'Idaho Natives' },
  lineupRules: { allowExpanded: true, maxBatters: 12, allowMidGameExtension: true, allowMidGameContraction: false },
  games: [{ id: 'g1', opponentName: 'Eagles', scheduledAt: '2026-10-30T22:00:00Z', timeZone: 'America/Boise', status: 'scheduled' }],
  scoredGameCount: 0,
  batting: [],
  pitching: [],
  defaultTier: 'high_school',
  features: { advancedBatting: false, advancedPitching: false },
  canAddGame: true,
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('TournamentsScreen', () => {
  it('should list tournaments and start a new one', () => {
    mockUseTournaments.mockReturnValue({ data: [{ id: 'tr1', name: 'Fall Classic', startDate: '2026-10-30', endDate: '2026-11-01', status: 'active' }] });
    renderWithQuery(<TournamentsScreen />);
    expect(screen.getByText('Oct 30 – Nov 1, 2026')).toBeTruthy();
    fireEvent.press(screen.getByText('Fall Classic'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/tournaments/[tournamentId]', params: { tournamentId: 'tr1' } });
    fireEvent.press(screen.getByLabelText('New tournament'));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/more/tournaments/new');
  });
});

describe('NewTournamentScreen', () => {
  it('should create a tournament for a new team and open it', async () => {
    mockUseTeamOptions.mockReturnValue({ data: [] });
    mockCreate.mockResolvedValue({ tournamentId: 'tr9', teamId: 't9', seasonId: 's9' });
    renderWithQuery(<NewTournamentScreen />);
    await waitFor(() => expect(screen.getByLabelText('Tournament name')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Tournament name'), 'Fall Classic');
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Idaho Natives');
    await act(async () => {
      fireEvent.press(screen.getByText('Create tournament'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fall Classic', requestId: '99999999-9999-4999-8999-999999999999', team: { type: 'new', name: 'Idaho Natives' } }),
      expect.anything(),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/more/tournaments/[tournamentId]', params: { tournamentId: 'tr9' } }));
    expect(mockTriggerSync).toHaveBeenCalled();
  });

  it("should show the server's refusal", async () => {
    mockUseTeamOptions.mockReturnValue({ data: [{ id: TEAM, name: 'Huskies', organization: null, stateCode: null, role: 'head_coach' }] });
    mockCreate.mockRejectedValue(new Error('You must be an active head coach or athletic director for the selected team.'));
    renderWithQuery(<NewTournamentScreen />);
    await waitFor(() => expect(screen.getByText('Huskies')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Tournament name'), 'Fall Classic');
    await act(async () => {
      fireEvent.press(screen.getByText('Create tournament'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockCreate.mock.calls[0][0].team).toEqual({ type: 'existing', teamId: TEAM });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();

    // Editing the form clears the refusal.
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Tournament name'), 'Fall Classic II');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('TournamentScreen', () => {
  it("should show the tournament and let a coach add a game for the tournament's team", () => {
    mockParams.mockReturnValue({ tournamentId: 'tr1' });
    mockUseTournament.mockReturnValue({ data: detail() });
    renderWithQuery(<TournamentScreen />);

    expect(screen.getByText('Up to 12')).toBeTruthy();
    expect(screen.getByText('Stats appear here once a tournament game is scored.')).toBeTruthy();
    fireEvent.press(screen.getByText('Eagles'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]', params: { gameId: 'g1' } });
    fireEvent.press(screen.getByText('Add game'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/schedule/games/new',
      params: { tournamentId: 'tr1', teamId: TEAM, tournamentName: 'Fall Classic' },
    });
  });

  it('should show batting lines once a game is scored, and no Add game for a parent', () => {
    mockParams.mockReturnValue({ tournamentId: 'tr1' });
    const batter = {
      playerId: 'b1', playerName: 'Ann Coit', gamesAppeared: 1, plateAppearances: 4, atBats: 3, runs: 1, hits: 2,
      doubles: 1, triples: 0, homeRuns: 0, rbi: 1, walks: 1, strikeouts: 0, hitByPitch: 0, sacrificeFlies: 0,
      sacrificeHits: 0, avg: 0.667, obp: 0.75, slg: 1, ops: 1.75, iso: 0.333, babip: 0.667, kPct: 0, bbPct: 0.25, woba: 0.7,
      battedBalls: 3, hardHitBalls: 1, hardHitPct: 0.333, qab: 3, qabPct: 0.75,
    };
    mockUseTournament.mockReturnValue({ data: detail({ scoredGameCount: 1, batting: [batter], canAddGame: false }) });
    renderWithQuery(<TournamentScreen />);
    expect(screen.getByText('Ann Coit')).toBeTruthy();
    expect(screen.queryByText('Add game')).toBeNull();
  });
});
