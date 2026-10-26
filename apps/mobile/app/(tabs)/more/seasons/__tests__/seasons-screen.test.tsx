import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';
import { ApiError } from '../../../../../src/lib/api-client';

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
}));
const mockRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockRole() }));
const mockTriggerSync = jest.fn();
jest.mock('../../../../../src/providers/SyncProvider', () => ({ useSyncContext: () => ({ triggerSync: mockTriggerSync }) }));
jest.mock('../../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));
const mockUseSeasons = jest.fn();
const mockApi = { create: jest.fn(), activate: jest.fn(), deactivate: jest.fn() };
jest.mock('../../../../../src/features/seasons/seasons-api', () => ({
  ...jest.requireActual('../../../../../src/features/seasons/seasons-api'),
  useTeamSeasons: (...args: unknown[]) => mockUseSeasons(...args),
  createSeason: (...args: unknown[]) => mockApi.create(...args),
  activateSeason: (...args: unknown[]) => mockApi.activate(...args),
  deactivateSeason: (...args: unknown[]) => mockApi.deactivate(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const SeasonsScreen = require('../index').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const TEAM = '11111111-1111-4111-8111-111111111111';
const seasons = [
  { seasonId: 's-fall', name: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-11-30', isActive: true },
  { seasonId: 's-spring', name: 'Spring 2026', startDate: '2026-03-01', endDate: '2026-05-31', isActive: false },
];
const year = new Date().getFullYear();
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const pressAlertButton = (label: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => void }>;
  buttons.find((b) => b.text === label)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true, role: 'head_coach' }, loading: false });
  mockUseSeasons.mockReturnValue({ data: { seasons } });
});

describe('SeasonsScreen', () => {
  it('should list the seasons with the active one marked', () => {
    renderWithQuery(<SeasonsScreen />);
    expect(screen.getByText('Seasons (2)')).toBeTruthy();
    expect(screen.getByText('Fall 2026')).toBeTruthy();
    expect(screen.getByText('Sep 1, 2026 – Nov 30, 2026')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('should create the picked season and sync the games it took in', async () => {
    mockApi.create.mockResolvedValue({ seasonId: 's-new', gamesAttached: 3 });
    renderWithQuery(<SeasonsScreen />);
    fireEvent.press(screen.getByText('Fall'));
    fireEvent.press(screen.getByText(String(year + 1)));
    fireEvent.press(screen.getByText(`Create Fall ${year + 1}`));
    await waitFor(() => expect(mockApi.create).toHaveBeenCalledWith(TEAM, 'Fall', year + 1));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(`Fall ${year + 1} created`, '3 games in its dates joined it.'));
    expect(mockTriggerSync).toHaveBeenCalled();
  });

  it('should show why a season couldn’t be created', async () => {
    mockApi.create.mockRejectedValue(new ApiError('conflict', `Spring ${year} already exists.`));
    renderWithQuery(<SeasonsScreen />);
    fireEvent.press(screen.getByText(`Create Spring ${year}`));
    expect(await screen.findByText(`Spring ${year} already exists.`)).toBeTruthy();
    expect(mockTriggerSync).not.toHaveBeenCalled();
  });

  it('should set a season active, or deactivate the active one', async () => {
    mockApi.activate.mockResolvedValue({ ok: true });
    mockApi.deactivate.mockResolvedValue({ ok: true });
    renderWithQuery(<SeasonsScreen />);

    fireEvent.press(screen.getByText('Spring 2026'));
    pressAlertButton('Set active');
    await waitFor(() => expect(mockApi.activate).toHaveBeenCalledWith(TEAM, 's-spring'));

    fireEvent.press(screen.getByText('Fall 2026'));
    pressAlertButton('Deactivate');
    await waitFor(() => expect(mockApi.deactivate).toHaveBeenCalledWith(TEAM, 's-fall'));
  });

  it('should tell non-coaches seasons are for coaches', () => {
    mockUseSeasons.mockReturnValue({ data: undefined, error: new ApiError('forbidden', 'Only coaches can manage seasons.') });
    renderWithQuery(<SeasonsScreen />);
    expect(screen.getByText('Coaches only')).toBeTruthy();
  });
});
