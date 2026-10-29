import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';
import { ApiError } from '../../../../../src/lib/api-client';

const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams(),
}));
const mockUseStaff = jest.fn();
const mockRemove = jest.fn();
jest.mock('../../../../../src/features/league-admin/league-admin-api', () => ({
  leagueStaffQueryKey: (leagueId: string) => ['league-admin', leagueId, 'staff'],
  useLeagueStaff: (...args: unknown[]) => mockUseStaff(...args),
  removeLeagueStaff: (...args: unknown[]) => mockRemove(...args),
}));
const mockOpenOnWeb = jest.fn();
jest.mock('../../../../../src/lib/web-links', () => ({
  webUrl: () => 'https://example.com/',
  openOnWeb: (...args: unknown[]) => mockOpenOnWeb(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const StaffScreen = require('../[leagueId]/staff').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const data = {
  data: {
    league: { id: LEAGUE, name: 'Valley League' },
    staff: [
      { staffId: 's1', userId: 'u1', role: 'league_admin', name: 'Cy Young', email: 'cy@example.com', isYou: true },
      { staffId: 's2', userId: 'u2', role: 'league_manager', name: 'Ann Bell', email: 'ann@example.com', isYou: false },
    ],
  },
};
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const pressAlertButton = (label: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => void }>;
  buttons.find((b) => b.text === label)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ leagueId: LEAGUE });
  mockUseStaff.mockReturnValue(data);
});

describe('LeagueStaffScreen', () => {
  it('should list the staff with their roles and remove someone after confirming', async () => {
    mockRemove.mockResolvedValue({ staffId: 's2' });
    renderWithQuery(<StaffScreen />);
    expect(screen.getByText('Cy Young')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Manager')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Remove Ann Bell'));
    expect(alertSpy.mock.calls[0][0]).toBe('Remove Ann Bell from the league’s staff?');
    pressAlertButton('Remove');
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(LEAGUE, 's2'));
  });

  it('should never offer to remove the admin themselves', () => {
    renderWithQuery(<StaffScreen />);
    fireEvent.press(screen.getByLabelText('Cy Young, you'));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('should show why a removal was refused', async () => {
    mockRemove.mockRejectedValue(new ApiError('conflict', 'You can’t remove yourself from the league’s staff.'));
    renderWithQuery(<StaffScreen />);
    fireEvent.press(screen.getByLabelText('Remove Ann Bell'));
    pressAlertButton('Remove');
    await waitFor(() =>
      expect(alertSpy).toHaveBeenLastCalledWith('Couldn’t remove them', 'You can’t remove yourself from the league’s staff.'),
    );
  });

  it('should keep a league manager out and send invites to the web', () => {
    const { unmount } = renderWithQuery(<StaffScreen />);
    fireEvent.press(screen.getByText('Invite staff'));
    expect(mockOpenOnWeb).toHaveBeenCalledWith('/league/admin');
    unmount();

    mockUseStaff.mockReturnValue({ data: undefined, error: new ApiError('forbidden', 'Only league admins can manage the league’s staff.') });
    renderWithQuery(<StaffScreen />);
    expect(screen.getByText('League admins only')).toBeTruthy();
  });
});
