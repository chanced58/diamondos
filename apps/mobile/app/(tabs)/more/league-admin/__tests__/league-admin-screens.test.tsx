import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';
import { ApiError } from '../../../../../src/lib/api-client';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    back: () => mockBack(),
  },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams(),
}));
const mockRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockRole() }));
const mockTriggerSync = jest.fn();
jest.mock('../../../../../src/providers/SyncProvider', () => ({ useSyncContext: () => ({ triggerSync: mockTriggerSync }) }));
jest.mock('../../../../../src/lib/web-links', () => ({ webUrl: () => 'https://example.com/', openOnWeb: jest.fn() }));
jest.mock('../../../../../src/features/forms/DateTimeFields', () => ({ DateTimeFields: () => null }));
jest.mock('../../../../../src/features/stats/season-stats-api', () => ({ localToday: () => '2027-03-10' }));
const mockUsePlayers = jest.fn();
const mockUsePlayer = jest.fn();
const mockApi = { create: jest.fn(), transfer: jest.fn(), release: jest.fn() };
jest.mock('../../../../../src/features/league-admin/league-admin-api', () => ({
  leagueAdminQueryKey: (leagueId: string) => ['league-admin', leagueId],
  useLeaguePlayers: (...args: unknown[]) => mockUsePlayers(...args),
  useLeaguePlayer: (...args: unknown[]) => mockUsePlayer(...args),
  createLeaguePlayer: (...args: unknown[]) => mockApi.create(...args),
  transferLeaguePlayer: (...args: unknown[]) => mockApi.transfer(...args),
  releaseLeaguePlayer: (...args: unknown[]) => mockApi.release(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const LeagueAdminScreen = require('../[leagueId]/index').default;
const PlayersScreen = require('../[leagueId]/players/index').default;
const NewPlayerScreen = require('../[leagueId]/players/new').default;
const PlayerScreen = require('../[leagueId]/players/[playerId]/index').default;
const MoveScreen = require('../[leagueId]/players/[playerId]/move').default;
const ReleaseScreen = require('../[leagueId]/players/[playerId]/release').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const TEAM = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const teams = [
  { teamId: TEAM, name: 'Hawks', divisionId: 'north' },
  { teamId: OTHER, name: 'Owls', divisionId: 'south' },
];
const players = [
  { playerId: 'p1', firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7, primaryPosition: 'pitcher', teamId: TEAM, teamName: 'Hawks' },
  { playerId: 'p2', firstName: 'Ava', lastName: 'Diaz', jerseyNumber: null, primaryPosition: null, teamId: null, teamName: null },
];
const list = (canEdit = true) => ({
  data: {
    league: { id: LEAGUE, name: 'Valley League' },
    canEdit,
    players,
    teams,
    divisions: [{ id: 'north', name: 'North' }, { id: 'south', name: 'South' }],
  },
});
const detail = (extra = {}, canEdit = true) => ({
  data: {
    canEdit,
    player: { ...players[0], dateOfBirth: '2010-04-02', bats: 'right', throws: 'left', graduationYear: 2028, ...extra },
    transfers: [{ id: 'tr1', type: 'trade', fromTeamName: 'Owls', toTeamName: 'Hawks', transferredAt: '2027-03-01T00:00:00Z', reason: 'Balance' }],
    teams,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ leagueId: LEAGUE, playerId: 'p1' });
  mockRole.mockReturnValue({ leagueRoles: [{ leagueId: LEAGUE, leagueName: 'Valley League', leagueSlug: null, role: 'league_admin' }] });
  mockUsePlayers.mockReturnValue(list());
  mockUsePlayer.mockReturnValue(detail());
});

describe('LeagueAdminScreen', () => {
  it('should open the league’s players, and keep strangers out', () => {
    const { unmount } = renderWithQuery(<LeagueAdminScreen />);
    fireEvent.press(screen.getByText('Players'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/league-admin/[leagueId]/players', params: { leagueId: LEAGUE } });
    unmount();

    mockRole.mockReturnValue({ leagueRoles: [] });
    renderWithQuery(<LeagueAdminScreen />);
    expect(screen.getByText('League staff only')).toBeTruthy();
  });

  it('should offer the staff list to league admins only', () => {
    const { unmount } = renderWithQuery(<LeagueAdminScreen />);
    fireEvent.press(screen.getByText('Staff'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/league-admin/[leagueId]/staff', params: { leagueId: LEAGUE } });
    unmount();

    mockRole.mockReturnValue({ leagueRoles: [{ leagueId: LEAGUE, leagueName: 'Valley League', leagueSlug: null, role: 'league_manager' }] });
    renderWithQuery(<LeagueAdminScreen />);
    expect(screen.queryByText('Staff')).toBeNull();
  });
});

describe('LeaguePlayersScreen', () => {
  it('should list the players and filter to free agents, a team or a search', () => {
    renderWithQuery(<PlayersScreen />);
    expect(screen.getByText('2 players · 1 free agent · 2 teams')).toBeTruthy();
    expect(screen.getByText('#7 · P · Hawks')).toBeTruthy();

    fireEvent.press(screen.getByText('Free agents (1)'));
    expect(screen.queryByText('Sam Lee')).toBeNull();
    expect(screen.getByText('Ava Diaz')).toBeTruthy();

    fireEvent.press(screen.getByText('Hawks'));
    expect(screen.getByText('Sam Lee')).toBeTruthy();
    expect(screen.queryByText('Ava Diaz')).toBeNull();

    fireEvent.press(screen.getByText('All teams'));
    fireEvent.changeText(screen.getByLabelText('Search players'), 'diaz');
    expect(screen.queryByText('Sam Lee')).toBeNull();
    fireEvent.press(screen.getByText('Ava Diaz'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/more/league-admin/[leagueId]/players/[playerId]',
      params: { leagueId: LEAGUE, playerId: 'p2' },
    });
  });

  it('should tell someone off the staff the players are for staff', () => {
    mockUsePlayers.mockReturnValue({ data: undefined, error: new ApiError('not_found', 'League not found.') });
    renderWithQuery(<PlayersScreen />);
    expect(screen.getByText('League staff only')).toBeTruthy();
  });
});

describe('NewLeaguePlayerScreen', () => {
  it('should register a player on the picked team, then open them', async () => {
    mockApi.create.mockResolvedValue({ playerId: 'p9' });
    renderWithQuery(<NewPlayerScreen />);
    fireEvent.changeText(screen.getByLabelText('First name'), ' Cy ');
    fireEvent.changeText(screen.getByLabelText('Last name'), 'Park');
    fireEvent.changeText(screen.getByLabelText('Jersey number'), '12');
    fireEvent.press(screen.getByText('Owls'));
    fireEvent.press(screen.getByText('Add player'));

    await waitFor(() =>
      expect(mockApi.create).toHaveBeenCalledWith(LEAGUE, { firstName: 'Cy', lastName: 'Park', jerseyNumber: 12, teamId: OTHER }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(tabs)/more/league-admin/[leagueId]/players/[playerId]',
        params: { leagueId: LEAGUE, playerId: 'p9' },
      }),
    );
  });

  it('should ask for a name, and refuse league managers', () => {
    const { unmount } = renderWithQuery(<NewPlayerScreen />);
    fireEvent.press(screen.getByText('Add player'));
    expect(screen.getByText('Enter a first and last name.')).toBeTruthy();
    expect(mockApi.create).not.toHaveBeenCalled();
    unmount();

    mockUsePlayers.mockReturnValue(list(false));
    renderWithQuery(<NewPlayerScreen />);
    expect(screen.getByText('League admins only')).toBeTruthy();
  });
});

describe('LeaguePlayerScreen', () => {
  it('should show the player and their transfers, with trade and release for admins', () => {
    renderWithQuery(<PlayerScreen />);
    expect(screen.getByText('Trade: Owls → Hawks')).toBeTruthy();
    expect(screen.getByText('Balance')).toBeTruthy();
    fireEvent.press(screen.getByText('Trade to another team'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/more/league-admin/[leagueId]/players/[playerId]/move',
      params: { leagueId: LEAGUE, playerId: 'p1' },
    });
    fireEvent.press(screen.getByText('Release to free agents'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/more/league-admin/[leagueId]/players/[playerId]/release',
      params: { leagueId: LEAGUE, playerId: 'p1' },
    });
  });

  it('should offer a free agent an assignment, and managers nothing to change', () => {
    mockUsePlayer.mockReturnValue(detail({ teamId: null, teamName: null }));
    const { unmount } = renderWithQuery(<PlayerScreen />);
    expect(screen.getByText('Assign to a team')).toBeTruthy();
    expect(screen.queryByText('Release to free agents')).toBeNull();
    unmount();

    mockUsePlayer.mockReturnValue(detail({}, false));
    renderWithQuery(<PlayerScreen />);
    expect(screen.queryByText('Trade to another team')).toBeNull();
  });
});

describe('MoveLeaguePlayerScreen', () => {
  it('should trade the player, confirming a jersey clash before clearing it', async () => {
    mockApi.transfer
      .mockResolvedValueOnce({ status: 'jersey_conflict', jerseyNumber: 7, conflictingPlayerName: 'Ben Cole' })
      .mockResolvedValueOnce({ status: 'moved', transferId: 'tr2' });
    renderWithQuery(<MoveScreen />);
    // Their own team isn't offered.
    expect(screen.queryByText('Hawks')).toBeNull();
    fireEvent.press(screen.getByText('Owls'));
    fireEvent.changeText(screen.getByLabelText('Reason'), ' Balance ');
    fireEvent.press(screen.getByText('Confirm trade'));

    expect(await screen.findByText(/Jersey #7 is taken by Ben Cole on that team/)).toBeTruthy();
    expect(mockApi.transfer).toHaveBeenCalledWith(LEAGUE, 'p1', { toTeamId: OTHER, reason: 'Balance', acceptJerseyClear: false, effectiveAt: undefined });
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Confirm & clear jersey'));
    await waitFor(() =>
      expect(mockApi.transfer).toHaveBeenLastCalledWith(LEAGUE, 'p1', { toTeamId: OTHER, reason: 'Balance', acceptJerseyClear: true, effectiveAt: undefined }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockTriggerSync).toHaveBeenCalled();
  });

  it('should show why a move was refused', async () => {
    mockApi.transfer.mockRejectedValue(new ApiError('conflict', 'This player is in a game in progress. Finalize the game first.'));
    renderWithQuery(<MoveScreen />);
    fireEvent.press(screen.getByText('Owls'));
    fireEvent.press(screen.getByText('Confirm trade'));
    expect(await screen.findByText('This player is in a game in progress. Finalize the game first.')).toBeTruthy();
  });
});

describe('ReleaseLeaguePlayerScreen', () => {
  it('should release the player with a reason', async () => {
    mockApi.release.mockResolvedValue({ transferId: 'tr3' });
    renderWithQuery(<ReleaseScreen />);
    fireEvent.changeText(screen.getByLabelText('Reason'), 'Moved away');
    fireEvent.press(screen.getByText('Confirm release'));
    await waitFor(() => expect(mockApi.release).toHaveBeenCalledWith(LEAGUE, 'p1', { reason: 'Moved away' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('should say a free agent can’t be released', () => {
    mockUsePlayer.mockReturnValue(detail({ teamId: null, teamName: null }));
    renderWithQuery(<ReleaseScreen />);
    expect(screen.getByText('Already a free agent')).toBeTruthy();
  });
});
