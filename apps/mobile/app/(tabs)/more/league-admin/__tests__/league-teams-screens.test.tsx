import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';
import { ApiError } from '../../../../../src/lib/api-client';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams(),
}));
const mockUseTeams = jest.fn();
const mockApi = { addDivision: jest.fn(), removeDivision: jest.fn(), setDivision: jest.fn(), setActive: jest.fn(), removeTeam: jest.fn() };
jest.mock('../../../../../src/features/league-admin/league-admin-api', () => ({
  leagueAdminQueryKey: (leagueId: string) => ['league-admin', leagueId],
  useLeagueTeams: (...args: unknown[]) => mockUseTeams(...args),
  addLeagueDivision: (...args: unknown[]) => mockApi.addDivision(...args),
  removeLeagueDivision: (...args: unknown[]) => mockApi.removeDivision(...args),
  setLeagueTeamDivision: (...args: unknown[]) => mockApi.setDivision(...args),
  setLeagueTeamActive: (...args: unknown[]) => mockApi.setActive(...args),
  removeLeagueTeam: (...args: unknown[]) => mockApi.removeTeam(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const TeamsScreen = require('../[leagueId]/teams/index').default;
const TeamScreen = require('../[leagueId]/teams/[membershipId]').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const teams = [
  { membershipId: 'm1', name: 'Hawks', organization: 'Valley HS', divisionId: 'north', isOpponentTeam: false, isActive: true },
  { membershipId: 'm2', name: 'Bears', organization: null, divisionId: null, isOpponentTeam: true, isActive: false },
];
const data = (extra = {}) => ({
  data: {
    league: { id: LEAGUE, name: 'Valley League' },
    canEditTeams: true,
    canEditDivisions: true,
    teams,
    divisions: [{ id: 'north', name: 'North' }, { id: 'south', name: 'South' }],
    ...extra,
  },
});
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const pressAlertButton = (label: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => void }>;
  buttons.find((b) => b.text === label)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ leagueId: LEAGUE, membershipId: 'm1' });
  mockUseTeams.mockReturnValue(data());
});

describe('LeagueTeamsScreen', () => {
  it('should group the teams by division and open one for an admin', () => {
    renderWithQuery(<TeamsScreen />);
    expect(screen.getByText('Divisions (2)')).toBeTruthy();
    expect(screen.getByText('North (1)')).toBeTruthy();
    expect(screen.getByText('South (0)')).toBeTruthy();
    expect(screen.getByText('No division (1)')).toBeTruthy();
    expect(screen.getByText('Opponent')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();

    fireEvent.press(screen.getByText('Hawks'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/more/league-admin/[leagueId]/teams/[membershipId]',
      params: { leagueId: LEAGUE, membershipId: 'm1' },
    });
  });

  it('should add a division, show a refusal, and remove one once confirmed', async () => {
    mockApi.addDivision.mockRejectedValueOnce(new ApiError('conflict', 'There is already a division named North.'));
    mockApi.removeDivision.mockResolvedValue({ divisionId: 'south' });
    renderWithQuery(<TeamsScreen />);

    fireEvent.changeText(screen.getByLabelText('Division name'), ' North ');
    fireEvent.press(screen.getByText('Add'));
    expect(await screen.findByText('There is already a division named North.')).toBeTruthy();
    expect(mockApi.addDivision).toHaveBeenCalledWith(LEAGUE, 'North');

    fireEvent.press(screen.getByText('South'));
    pressAlertButton('Remove');
    await waitFor(() => expect(mockApi.removeDivision).toHaveBeenCalledWith(LEAGUE, 'south'));
  });

  it('should leave teams closed to a league manager', () => {
    mockUseTeams.mockReturnValue(data({ canEditTeams: false }));
    renderWithQuery(<TeamsScreen />);
    fireEvent.press(screen.getByText('Hawks'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('LeagueTeamScreen', () => {
  it('should move the team between divisions and out of all of them', async () => {
    mockApi.setDivision.mockResolvedValue({ membershipId: 'm1' });
    renderWithQuery(<TeamScreen />);
    fireEvent.press(screen.getByText('South'));
    await waitFor(() => expect(mockApi.setDivision).toHaveBeenCalledWith(LEAGUE, 'm1', 'south'));
    fireEvent.press(screen.getByText('None'));
    await waitFor(() => expect(mockApi.setDivision).toHaveBeenLastCalledWith(LEAGUE, 'm1', null));
  });

  it('should deactivate the team, and remove it once confirmed', async () => {
    mockApi.setActive.mockResolvedValue({ membershipId: 'm1' });
    mockApi.removeTeam.mockResolvedValue({ membershipId: 'm1' });
    renderWithQuery(<TeamScreen />);
    fireEvent.press(screen.getByText('Deactivate team'));
    await waitFor(() => expect(mockApi.setActive).toHaveBeenCalledWith(LEAGUE, 'm1', false));

    fireEvent.press(screen.getByText('Remove from league'));
    expect(mockApi.removeTeam).not.toHaveBeenCalled();
    pressAlertButton('Remove');
    await waitFor(() => expect(mockApi.removeTeam).toHaveBeenCalledWith(LEAGUE, 'm1'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('should offer activation to an inactive team, and nothing to a manager', () => {
    mockParams.mockReturnValue({ leagueId: LEAGUE, membershipId: 'm2' });
    const { unmount } = renderWithQuery(<TeamScreen />);
    expect(screen.getByText('Activate team')).toBeTruthy();
    unmount();

    mockUseTeams.mockReturnValue(data({ canEditTeams: false }));
    renderWithQuery(<TeamScreen />);
    expect(screen.getByText('League admins only')).toBeTruthy();
  });
});
