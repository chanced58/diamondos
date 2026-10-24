import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { LeagueChannelDetailResponse } from '@baseball/shared';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ channelId: 'league-ch-1' }),
}));
jest.mock('../../../../../src/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const mockUseLeagueChannel = jest.fn();
const mockRealtime = jest.fn();
const mockPost = jest.fn();
jest.mock('../../../../../src/features/messaging/league-messaging-api', () => ({
  leagueChannelQueryKey: (id: string) => ['league-channels', id],
  useLeagueChannel: (id: string) => mockUseLeagueChannel(id),
  useLeagueChannelRealtime: (id: string) => mockRealtime(id),
  postLeagueMessage: (...args: unknown[]) => mockPost(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LeagueChannelScreen = require('../[channelId]').default;

const detail = (channelType: 'announcement' | 'topic', canPost: boolean): { data: LeagueChannelDetailResponse } => ({
  data: {
    channel: { id: 'league-ch-1', leagueId: 'l1', name: 'League Announcements', channelType, description: 'Official' },
    canPost,
    messages: [
      { id: 'm1', body: 'Schedules are out', senderId: 'admin', senderName: 'Ann Coit', createdAt: '2026-10-24T01:00:00Z', editedAt: null },
      { id: 'm2', body: 'Thanks!', senderId: 'me', senderName: 'Me Self', createdAt: '2026-10-24T02:00:00Z', editedAt: '2026-10-24T02:01:00Z' },
    ],
  },
});

beforeEach(() => jest.clearAllMocks());

describe('LeagueChannelScreen', () => {
  it('should show announcements with their senders, and stay read-only for a member who cannot post', () => {
    mockUseLeagueChannel.mockReturnValue(detail('announcement', false));
    renderScreen();

    expect(mockRealtime).toHaveBeenCalledWith('league-ch-1');
    expect(screen.getByText('Ann Coit')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('(edited)')).toBeTruthy();
    expect(screen.getByText('Read-only. Only league staff can post here.')).toBeTruthy();
    expect(screen.queryByLabelText('Send message')).toBeNull();
  });

  it('should post as the signed-in user and clear the draft', async () => {
    mockUseLeagueChannel.mockReturnValue(detail('topic', true));
    mockPost.mockResolvedValue(undefined);
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Write a message...'), '  Rain delay  ');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send message'));
    });

    expect(mockPost).toHaveBeenCalledWith('league-ch-1', 'me', 'Rain delay');
    await waitFor(() => expect(screen.getByPlaceholderText('Write a message...').props.value).toBe(''));
  });

  it('should keep the draft and say why when posting fails', async () => {
    mockUseLeagueChannel.mockReturnValue(detail('topic', true));
    mockPost.mockRejectedValue(new Error('new row violates row-level security policy'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Write a message...'), 'Rain delay');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send message'));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByPlaceholderText('Write a message...').props.value).toBe('Rain delay');
  });

  it('should offer a retry when the channel cannot load', () => {
    const refetch = jest.fn();
    mockUseLeagueChannel.mockReturnValue({ data: undefined, isPending: false, error: new Error('offline'), refetch });
    renderScreen();
    expect(screen.queryByText('Schedules are out')).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});

function renderScreen() {
  return renderWithQuery(<LeagueChannelScreen />);
}
