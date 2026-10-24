import { fireEvent, render, screen } from '@testing-library/react-native';
import { LeagueChannelSection } from '../LeagueChannelSection';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

const channel = { id: 'lc-1', name: 'League Announcements', channelType: 'announcement' as const, description: null, canPost: false };

beforeEach(() => jest.clearAllMocks());

describe('LeagueChannelSection', () => {
  it("should list the league's channels under its name and open one", () => {
    render(
      <LeagueChannelSection league={{ data: { teamId: 't1', leagueName: 'Idaho 2A', channels: [channel] }, error: null, refetch: jest.fn() }} />,
    );
    expect(screen.getByText('Idaho 2A')).toBeTruthy();
    expect(screen.getByText('Read-only')).toBeTruthy();

    fireEvent.press(screen.getByText('League Announcements'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/messages/league/[channelId]', params: { channelId: 'lc-1' } });
  });

  it('should show nothing for a team in no league, or in no league channel', () => {
    const { toJSON } = render(
      <LeagueChannelSection league={{ data: { teamId: 't1', leagueName: null, channels: [] }, error: null, refetch: jest.fn() }} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('should say when the league channels could not load, and retry on tap', () => {
    const refetch = jest.fn();
    render(<LeagueChannelSection league={{ data: undefined, error: new Error('offline'), refetch }} />);
    fireEvent.press(screen.getByText(/League channels:/));
    expect(refetch).toHaveBeenCalled();
  });
});
