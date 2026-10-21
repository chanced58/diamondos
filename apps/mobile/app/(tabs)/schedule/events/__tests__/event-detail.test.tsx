import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({ eventId: 'e1' }),
  Stack: { Screen: () => null },
}));
const mockUseRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockUseRole() }));
const mockFetchTeamEvent = jest.fn();
const mockDeleteTeamEvent = jest.fn();
jest.mock('../../../../../src/features/events/team-events-api', () => ({
  teamEventQueryKey: (id: string) => ['team-events', id],
  fetchTeamEvent: (...args: unknown[]) => mockFetchTeamEvent(...args),
  deleteTeamEvent: (...args: unknown[]) => mockDeleteTeamEvent(...args),
}));
jest.mock('../../../../../src/lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TeamEventScreen = require('../[eventId]').default;

const event = {
  id: 'e1', teamId: 't1', title: 'Team dinner', eventType: 'meeting', startsAt: '2026-10-23T01:00:00.000Z',
  endsAt: null, location: 'Clubhouse', address: '1 Main St', latitude: null, longitude: null, description: 'Bring a dish',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchTeamEvent.mockResolvedValue(event);
});

it('should show the event to a player without a delete button', async () => {
  mockUseRole.mockReturnValue({ memberships: [{ teamId: 't1', isCoach: false }] });
  renderWithQuery(<TeamEventScreen />);

  await waitFor(() => expect(screen.getByText('Team dinner')).toBeTruthy());
  expect(screen.getByText('Team meeting')).toBeTruthy();
  expect(screen.getByText('1 Main St')).toBeTruthy();
  expect(screen.queryByText('Delete event')).toBeNull();
});

it('should say so when the event no longer exists', async () => {
  mockUseRole.mockReturnValue({ memberships: [] });
  mockFetchTeamEvent.mockResolvedValue(null);
  renderWithQuery(<TeamEventScreen />);
  await waitFor(() => expect(screen.getByText('Event not found')).toBeTruthy());
});

it('should let a coach delete only after confirming, then go back', async () => {
  mockUseRole.mockReturnValue({ memberships: [{ teamId: 't1', isCoach: true }] });
  mockDeleteTeamEvent.mockResolvedValue({ eventId: 'e1' });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderWithQuery(<TeamEventScreen />);
  await waitFor(() => expect(screen.getByText('Delete event')).toBeTruthy());

  fireEvent.press(screen.getByText('Delete event'));
  expect(mockDeleteTeamEvent).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await act(async () => {
    buttons.find((b) => b.text === 'Delete event')?.onPress?.();
  });

  expect(mockDeleteTeamEvent).toHaveBeenCalledWith('e1');
  expect(mockBack).toHaveBeenCalled();
  alert.mockRestore();
});
