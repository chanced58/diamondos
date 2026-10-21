import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  Stack: { Screen: () => null },
}));
const mockUseRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockUseRole() }));
const mockTriggerSync = jest.fn();
jest.mock('../../../../../src/providers/SyncProvider', () => ({ useSyncContext: () => ({ triggerSync: mockTriggerSync }) }));
const mockFetchOptions = jest.fn();
const mockCreateGame = jest.fn();
jest.mock('../../../../../src/features/games/game-form-api', () => ({
  gameFormOptionsQueryKey: (teamId: string) => ['teams', teamId, 'game-form-options'],
  fetchGameFormOptions: (...args: unknown[]) => mockFetchOptions(...args),
  createGame: (...args: unknown[]) => mockCreateGame(...args),
}));
// The native pickers and venue search are exercised in their own tests.
jest.mock('../../../../../src/features/forms/DateTimeFields', () => ({ DateTimeFields: () => null }));
jest.mock('../../../../../src/features/places/VenueSearchField', () => ({ VenueSearchField: () => null }));
jest.mock('../../../../../src/lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NewGameScreen = require('../new').default;

const TEAM = '11111111-1111-4111-8111-111111111111';
const OPP = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRole.mockReturnValue({ activeTeam: { teamId: TEAM, teamName: 'Huskies', isCoach: true } });
  mockFetchOptions.mockResolvedValue({ opponentTeams: [{ id: OPP, name: 'Eagles', city: 'Boise' }] });
});

it('should keep non-coaches out', () => {
  mockUseRole.mockReturnValue({ activeTeam: { teamId: TEAM, teamName: 'Huskies', isCoach: false } });
  renderWithQuery(<NewGameScreen />);
  expect(screen.getByText('Coaches only')).toBeTruthy();
  expect(mockFetchOptions).not.toHaveBeenCalled();
});

it('should catch a missing opponent before calling the server', async () => {
  renderWithQuery(<NewGameScreen />);
  await waitFor(() => expect(screen.getByText('Schedule game')).toBeTruthy());

  fireEvent.press(screen.getByText('Schedule game'));

  expect(screen.getByText('Opponent name is required.')).toBeTruthy();
  expect(mockCreateGame).not.toHaveBeenCalled();
});

it('should schedule the game with a picked opponent team, then open it', async () => {
  mockCreateGame.mockResolvedValue({ gameId: 'g1' });
  renderWithQuery(<NewGameScreen />);
  await waitFor(() => expect(screen.getByText('Schedule game')).toBeTruthy());

  fireEvent.press(screen.getByRole('tab', { name: 'Team' }));
  fireEvent.press(screen.getByRole('radio', { name: /Eagles/ }));
  await act(async () => {
    fireEvent.press(screen.getByText('Schedule game'));
  });

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]', params: { gameId: 'g1' } }));
  expect(mockCreateGame).toHaveBeenCalledWith(expect.objectContaining({
    teamId: TEAM, opponentTeamId: OPP, opponentName: 'Eagles', opponentTbd: false, time: '16:00', notifyTeam: false,
  }));
  expect(mockTriggerSync).toHaveBeenCalled();
});

it("should show the server's reason when scheduling fails", async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ApiError } = require('../../../../../src/lib/api-client');
  mockCreateGame.mockRejectedValue(new ApiError('invalid', 'Selected opponent team does not belong to your team or league.'));
  renderWithQuery(<NewGameScreen />);
  await waitFor(() => expect(screen.getByText('Schedule game')).toBeTruthy());

  fireEvent.changeText(screen.getByLabelText('Opponent name'), 'Eagles');
  await act(async () => {
    fireEvent.press(screen.getByText('Schedule game'));
  });

  await waitFor(() => expect(screen.getByText('Selected opponent team does not belong to your team or league.')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
});
