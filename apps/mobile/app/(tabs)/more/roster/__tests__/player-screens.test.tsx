import { Alert } from 'react-native';
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
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
}));
const mockRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockRole() }));
const mockTriggerSync = jest.fn();
jest.mock('../../../../../src/providers/SyncProvider', () => ({ useSyncContext: () => ({ triggerSync: mockTriggerSync }) }));
jest.mock('../../../../../src/lib/web-links', () => ({ webUrl: () => 'https://example.com/', openOnWeb: jest.fn() }));
jest.mock('../../../../../src/features/forms/DateTimeFields', () => ({ DateTimeFields: () => null }));
jest.mock('../../../../../src/features/stats/season-stats-api', () => ({ localToday: () => '2026-10-25' }));
const mockUsePlayer = jest.fn();
const mockUseAvailability = jest.fn();
const mockApi = {
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  reactivate: jest.fn(),
  addFlag: jest.fn(),
  endFlag: jest.fn(),
};
jest.mock('../../../../../src/features/roster/roster-api', () => ({
  rosterPlayerQueryKey: (teamId: string, playerId: string) => ['roster', teamId, playerId],
  playerAvailabilityQueryKey: (teamId: string, playerId: string) => ['roster', teamId, playerId, 'availability'],
  useRosterPlayer: (...args: unknown[]) => mockUsePlayer(...args),
  usePlayerAvailability: (...args: unknown[]) => mockUseAvailability(...args),
  createRosterPlayer: (...args: unknown[]) => mockApi.create(...args),
  updateRosterPlayer: (...args: unknown[]) => mockApi.update(...args),
  deactivateRosterPlayer: (...args: unknown[]) => mockApi.deactivate(...args),
  reactivateRosterPlayer: (...args: unknown[]) => mockApi.reactivate(...args),
  addInjuryFlag: (...args: unknown[]) => mockApi.addFlag(...args),
  endInjuryFlag: (...args: unknown[]) => mockApi.endFlag(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const PlayerScreen = require('../[playerId]/index').default;
const EditPlayerScreen = require('../[playerId]/edit').default;
const AvailabilityScreen = require('../[playerId]/availability').default;
const NewPlayerScreen = require('../new').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const TEAM = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const player = (extra = {}) => ({
  id: PLAYER,
  teamId: TEAM,
  firstName: 'Sam',
  lastName: 'Lee',
  jerseyNumber: 7,
  primaryPosition: 'shortstop',
  secondaryPositions: ['pitcher'],
  bats: 'right',
  throws: 'left',
  graduationYear: 2027,
  email: 'sam@example.com',
  phone: null,
  isActive: true,
  disabledAt: null,
  ...extra,
});
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
/** Presses the button with this label in the last Alert's buttons. */
const pressAlertButton = (label: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => void }>;
  buttons.find((b) => b.text === label)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ playerId: PLAYER });
  mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true, role: 'head_coach' }, loading: false });
  mockUsePlayer.mockReturnValue({ data: { player: player(), canManage: true } });
});

describe('PlayerScreen', () => {
  it('should show the profile and let a manager edit, open availability and deactivate', async () => {
    mockApi.deactivate.mockResolvedValue({ playerId: PLAYER });
    renderWithQuery(<PlayerScreen />);

    expect(screen.getByText('#7')).toBeTruthy();
    expect(screen.getByText('SS — shortstop')).toBeTruthy();
    expect(screen.getByText('Bats Right · Throws Left · Class of 2027')).toBeTruthy();
    expect(screen.getByText('sam@example.com')).toBeTruthy();

    fireEvent.press(screen.getByText('Edit player'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/roster/[playerId]/edit', params: { playerId: PLAYER } });
    fireEvent.press(screen.getByText('Availability'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/roster/[playerId]/availability', params: { playerId: PLAYER } });

    fireEvent.press(screen.getByText('Deactivate player'));
    pressAlertButton('Deactivate');
    await waitFor(() => expect(mockApi.deactivate).toHaveBeenCalledWith(TEAM, PLAYER));
    await waitFor(() => expect(mockTriggerSync).toHaveBeenCalled());
  });

  it('should show a viewer who can’t manage the profile alone', () => {
    mockUsePlayer.mockReturnValue({ data: { player: player(), canManage: false } });
    renderWithQuery(<PlayerScreen />);
    expect(screen.getByText('Sam Lee')).toBeTruthy();
    expect(screen.queryByText('Edit player')).toBeNull();
    expect(screen.queryByText('Deactivate player')).toBeNull();
  });

  it('should reactivate a disabled player with a new number, and say why it failed', async () => {
    mockUsePlayer.mockReturnValue({ data: { player: player({ isActive: false, jerseyNumber: null, disabledAt: '2026-10-01T12:00:00Z' }), canManage: true } });
    mockApi.reactivate.mockRejectedValueOnce(new ApiError('conflict', 'Jersey #9 is already taken on this team.'));
    renderWithQuery(<PlayerScreen />);
    expect(screen.getByText('This player is disabled')).toBeTruthy();
    expect(screen.queryByText('Edit player')).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Jersey number'), '9');
    fireEvent.press(screen.getByText('Reactivate'));
    await waitFor(() => expect(mockApi.reactivate).toHaveBeenCalledWith(TEAM, PLAYER, 9));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Couldn’t reactivate the player', 'Jersey #9 is already taken on this team.'));

    mockApi.reactivate.mockResolvedValue({ playerId: PLAYER });
    fireEvent.changeText(screen.getByLabelText('Jersey number'), '');
    fireEvent.press(screen.getByText('Reactivate'));
    await waitFor(() => expect(mockApi.reactivate).toHaveBeenLastCalledWith(TEAM, PLAYER, null));
  });

  it('should show the error with a retry when the player can’t load', () => {
    const refetch = jest.fn();
    mockUsePlayer.mockReturnValue({ data: undefined, error: new ApiError('not_found', 'Player not found.'), refetch });
    renderWithQuery(<PlayerScreen />);
    fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('NewPlayerScreen', () => {
  it('should add the player, sync the roster and open the new player', async () => {
    mockApi.create.mockResolvedValue({ playerId: PLAYER, invited: false });
    renderWithQuery(<NewPlayerScreen />);

    fireEvent.changeText(screen.getByLabelText('First name'), 'Ana');
    fireEvent.changeText(screen.getByLabelText('Last name'), 'Ruiz');
    fireEvent.changeText(screen.getByLabelText('Jersey number'), '4');
    // The primary position row comes before the secondary one.
    fireEvent.press(screen.getAllByText('C')[0]);
    fireEvent.press(screen.getByText('Add player'));

    await waitFor(() =>
      expect(mockApi.create).toHaveBeenCalledWith(TEAM, expect.objectContaining({ firstName: 'Ana', lastName: 'Ruiz', jerseyNumber: 4, primaryPosition: 'catcher' })),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/more/roster/[playerId]', params: { playerId: PLAYER } }));
    expect(mockTriggerSync).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('should check the form first and say when the invite email didn’t go out', async () => {
    mockApi.create.mockResolvedValue({ playerId: PLAYER, invited: false });
    renderWithQuery(<NewPlayerScreen />);
    fireEvent.press(screen.getByText('Add player'));
    expect(screen.getByText('First name is required')).toBeTruthy();
    expect(mockApi.create).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('First name'), 'Ana');
    fireEvent.changeText(screen.getByLabelText('Last name'), 'Ruiz');
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    fireEvent.press(screen.getByText('Add player'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Player added', expect.stringContaining('ana@example.com')));
  });

  it('should keep the form for non-coaches closed', () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: false, role: 'parent' }, loading: false });
    renderWithQuery(<NewPlayerScreen />);
    expect(screen.getByText('Coaches only')).toBeTruthy();
  });
});

describe('EditPlayerScreen', () => {
  it('should save every field of the filled-in form and go back', async () => {
    mockApi.update.mockResolvedValue({ playerId: PLAYER });
    renderWithQuery(<EditPlayerScreen />);

    expect(screen.getByLabelText('Last name').props.value).toBe('Lee');
    fireEvent.changeText(screen.getByLabelText('Last name'), 'Leigh');
    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(mockApi.update).toHaveBeenCalledWith(TEAM, PLAYER, {
        firstName: 'Sam',
        lastName: 'Leigh',
        jerseyNumber: 7,
        primaryPosition: 'shortstop',
        secondaryPositions: ['pitcher'],
        bats: 'right',
        throws: 'left',
        graduationYear: 2027,
        email: 'sam@example.com',
        phone: null,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockTriggerSync).toHaveBeenCalled();
  });

  it('should show the server’s refusal under the form until the coach changes it', async () => {
    mockApi.update.mockRejectedValue(new ApiError('conflict', 'Jersey #7 is already taken on this team.'));
    renderWithQuery(<EditPlayerScreen />);
    fireEvent.press(screen.getByText('Save changes'));
    expect(await screen.findByText('Jersey #7 is already taken on this team.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Jersey number'), '8');
    expect(screen.queryByText('Jersey #7 is already taken on this team.')).toBeNull();
  });

  it('should not edit a disabled player', () => {
    mockUsePlayer.mockReturnValue({ data: { player: player({ isActive: false }), canManage: true } });
    renderWithQuery(<EditPlayerScreen />);
    expect(screen.getByText('Player is disabled')).toBeTruthy();
  });
});

describe('AvailabilityScreen', () => {
  const availability = {
    player: { id: PLAYER, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 },
    flags: [
      { id: 'f-active', injurySlug: 'shoulder', effectiveFrom: '2026-10-01', effectiveTo: null, notes: 'No throwing' },
      { id: 'f-past', injurySlug: 'ankle', effectiveFrom: '2026-09-01', effectiveTo: '2026-09-10', notes: null },
    ],
    catalog: [
      { slug: 'ankle', name: 'Ankle sprain', bodyPart: 'lower_body', description: null },
      { slug: 'shoulder', name: 'Shoulder soreness', bodyPart: 'upper_body', description: null },
    ],
  };

  it('should list active and past flags and end an active one today', async () => {
    mockUseAvailability.mockReturnValue({ data: availability });
    mockApi.endFlag.mockResolvedValue({ flagId: 'f-active' });
    renderWithQuery(<AvailabilityScreen />);

    expect(screen.getByText('Active flags')).toBeTruthy();
    expect(screen.getByText('Past flags')).toBeTruthy();
    expect(screen.getByText('No throwing')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('End Shoulder soreness today'));
    pressAlertButton('End today');
    await waitFor(() => expect(mockApi.endFlag).toHaveBeenCalledWith(TEAM, PLAYER, 'f-active', '2026-10-25'));
  });

  it('should not offer to end a flag that already ends today', () => {
    mockUseAvailability.mockReturnValue({
      data: { ...availability, flags: [{ ...availability.flags[0], effectiveTo: '2026-10-25' }] },
    });
    renderWithQuery(<AvailabilityScreen />);
    expect(screen.getByText('Active flags')).toBeTruthy();
    expect(screen.queryByLabelText('End Shoulder soreness today')).toBeNull();
  });

  it('should keep the entry when the server refuses the flag', async () => {
    mockUseAvailability.mockReturnValue({ data: availability });
    mockApi.addFlag.mockRejectedValue(new ApiError('conflict', 'This player already has an open-ended flag for that injury.'));
    renderWithQuery(<AvailabilityScreen />);

    fireEvent.press(screen.getAllByText('Shoulder soreness')[1]);
    fireEvent.press(screen.getByText('Add flag'));
    expect(await screen.findByText('This player already has an open-ended flag for that injury.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shoulder soreness', selected: true })).toBeTruthy();
  });

  it('should add an open-ended flag from today for the picked injury', async () => {
    mockUseAvailability.mockReturnValue({ data: availability });
    mockApi.addFlag.mockResolvedValue({ flagId: 'f-new' });
    renderWithQuery(<AvailabilityScreen />);

    fireEvent.press(screen.getByText('Add flag'));
    expect(screen.getByText('Pick an injury.')).toBeTruthy();
    expect(mockApi.addFlag).not.toHaveBeenCalled();

    fireEvent.press(screen.getAllByText('Ankle sprain')[0]);
    fireEvent.changeText(screen.getByLabelText('Notes'), '  Day to day ');
    fireEvent.press(screen.getByText('Add flag'));
    await waitFor(() =>
      expect(mockApi.addFlag).toHaveBeenCalledWith(TEAM, PLAYER, {
        injurySlug: 'ankle',
        effectiveFrom: '2026-10-25',
        effectiveTo: null,
        notes: 'Day to day',
      }),
    );
  });
});
