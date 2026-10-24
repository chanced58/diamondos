import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../src/__tests__/render-with-query';
import type { Message } from '../../../../src/db/models/Message';
import type { Channel } from '../../../../src/db/models/Channel';

/**
 * Covers W9 — empty message channel renders blank void (w9-brief.md)
 *
 * M4: Opening a channel with no messages shows an entirely blank message area.
 * The FlatList at lines 84-85 has no ListEmptyComponent.
 *
 * Required change: Add ListEmptyComponent with "No messages yet." text matching
 * the app's established "No … yet." convention, styled per schedule.tsx:148.
 *
 * Critical check:
 * - FlatList is inverted — empty component must be transformed to counter flip
 *
 * Loading state note: A loading state exists in the withObservables HOC wrapper
 * (via isFetching and shouldComponentUpdate), which prevents MessageThread from
 * rendering until data has emitted. This test file mocks withObservables, which
 * is a reasonable isolation choice but structurally cannot exercise the real
 * loading gate — that is covered by integration tests of the HOC itself.
 */

const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
};

const mockChannel = {
  id: 'local-channel-1',
  remoteId: 'channel-123',
  name: 'General',
  canPost: true,
} as unknown as Channel;

const mockMessage = {
  id: 'msg-1',
  remoteId: 'msg-remote-1',
  channelId: 'local-channel-1',
  channelRemoteId: 'channel-123',
  senderId: 'other-user-id',
  senderName: 'Alice',
  body: 'Hello world',
  createdAt: Date.now(),
  parentId: undefined,
  isPinned: false,
  syncedAt: undefined,
} as unknown as Message;

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: () => mockBack() },
  // Render the header's right button so tests can press it.
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => JSX.Element } }) => options?.headerRight?.() ?? null },
  useLocalSearchParams: () => ({ channelId: 'channel-123' }),
}));

const mockUseChannelDetail = jest.fn();
const mockDeleteMessage = jest.fn();
const mockDeleteChannel = jest.fn();
jest.mock('../../../../src/features/messaging/messaging-api', () => ({
  useChannelDetail: (id: string) => mockUseChannelDetail(id),
  deleteMessage: (id: string) => mockDeleteMessage(id),
  deleteChannel: (id: string) => mockDeleteChannel(id),
}));
const mockRemoveChannelLocally = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/features/messaging/local-channel', () => ({
  removeChannelLocally: (id: string) => mockRemoveChannelLocally(id),
}));
const mockRequestSync = jest.fn();
jest.mock('../../../../src/features/messaging/use-channel-realtime', () => ({
  useChannelRealtime: () => ({ requestSync: mockRequestSync }),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'uuid-1234',
}));

jest.mock('../../../../src/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

jest.mock('../../../../src/lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

jest.mock('../../../../src/db', () => ({
  database: {
    write: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(() => ({
      create: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(() => ({
        observe: jest.fn(() => ({
          pipe: jest.fn((_fn) => ({
            subscribe: jest.fn(),
          })),
        })),
      })),
    })),
  },
}));

// We need to track whether the observables are emitting messages
let mockMessages: Message[] = [];
let mockChannelData: Channel | undefined = mockChannel;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock('@nozbe/with-observables', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_observableKeys: string[], _observableProducer: (props: any) => any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Component: React.ComponentType<any>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (_props: any) => {
        // Provide mock observables so EnhancedMessageThread passes props to MessageThread
        // Use the current mockMessages and mockChannelData values
        const observables = {
          messages: mockMessages,
          channel: mockChannelData,
        };
        return <Component {..._props} {...observables} />;
      };
    };
});

// Require must come after jest.mock() calls to ensure mocks are set up before the module loads
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ChannelScreen = require('../[channelId]').default;

function renderScreen() {
  return renderWithQuery(<ChannelScreen />);
}

describe('MessageThread — ListEmptyComponent (W9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = [];
    mockChannelData = mockChannel;
    mockUseChannelDetail.mockReturnValue({ data: undefined });
  });

  it('should render "No messages yet." when channel is empty', async () => {
    mockMessages = [];
    renderScreen();

    await waitFor(
      () => {
        expect(screen.queryByText('No messages yet.')).toBeTruthy();
      },
      { timeout: 1000 },
    );
  });

  it('should not render "No messages yet." when channel has messages', async () => {
    mockMessages = [mockMessage];
    renderScreen();

    // The message should be rendered
    await waitFor(() => {
      expect(screen.queryByText('Hello world')).toBeTruthy();
    });

    // Empty state should not appear
    expect(screen.queryByText('No messages yet.')).toBeFalsy();
  });
});

describe('MessageThread — managing messages', () => {
  const sent = { ...mockMessage, syncedAt: Date.now() } as unknown as Message;
  const detail = (isCoach: boolean, channelType = 'topic') => ({
    data: {
      channel: { id: 'channel-123', teamId: 'team-1', channelType, displayName: 'Pitchers', description: null },
      canPost: true,
      isCoach,
      canDeleteChannel: isCoach && channelType !== 'direct',
      memberRoles: { 'other-user-id': 'head_coach' },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelData = mockChannel;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
  });

  it("should show the sender's role badge", () => {
    mockMessages = [sent];
    mockUseChannelDetail.mockReturnValue(detail(false));
    renderScreen();
    expect(screen.getByText('Coach')).toBeTruthy();
  });

  it("should let a coach delete someone else's message, then sync", async () => {
    mockMessages = [sent];
    mockUseChannelDetail.mockReturnValue(detail(true));
    mockDeleteMessage.mockResolvedValue({ messageId: 'msg-remote-1' });
    renderScreen();

    await act(async () => {
      fireEvent(screen.getByText('Hello world'), 'longPress');
    });
    await waitFor(() => expect(mockDeleteMessage).toHaveBeenCalledWith('msg-remote-1'));
    expect(mockRequestSync).toHaveBeenCalled();
  });

  it("should not delete someone else's message for a player, or one still queued offline", () => {
    mockMessages = [sent];
    mockUseChannelDetail.mockReturnValue(detail(false));
    const { unmount } = renderScreen();
    fireEvent(screen.getByText('Hello world'), 'longPress');
    expect(mockDeleteMessage).not.toHaveBeenCalled();
    unmount();

    mockMessages = [{ ...mockMessage, senderId: 'test-user-id' } as unknown as Message];
    mockUseChannelDetail.mockReturnValue(detail(true));
    renderScreen();
    fireEvent(screen.getByText('Hello world'), 'longPress');
    expect(mockDeleteMessage).not.toHaveBeenCalled();
  });

  it('should let a coach delete a topic channel, but not a DM', async () => {
    mockMessages = [];
    mockUseChannelDetail.mockReturnValue(detail(true));
    mockDeleteChannel.mockResolvedValue({ channelId: 'channel-123' });
    const { unmount } = renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Delete channel'));
    });
    await waitFor(() => expect(mockDeleteChannel).toHaveBeenCalledWith('channel-123'));
    // Off this device at once, not at the next deletion check.
    await waitFor(() => expect(mockRemoveChannelLocally).toHaveBeenCalledWith('channel-123'));
    expect(mockBack).toHaveBeenCalled();
    unmount();

    mockUseChannelDetail.mockReturnValue(detail(true, 'direct'));
    renderScreen();
    expect(screen.queryByLabelText('Delete channel')).toBeNull();
  });

  it('should send one delete however often a coach taps while it is in flight', async () => {
    mockMessages = [sent];
    mockUseChannelDetail.mockReturnValue(detail(true));
    mockDeleteMessage.mockReturnValue(new Promise(() => {}));
    mockDeleteChannel.mockReturnValue(new Promise(() => {}));
    renderScreen();
    // react-query publishes isPending on a setTimeout(0) tick.
    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    fireEvent(screen.getByText('Hello world'), 'longPress');
    await settle();
    fireEvent(screen.getByText('Hello world'), 'longPress');
    expect(mockDeleteMessage).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Delete channel'));
    await settle();
    fireEvent.press(screen.getByLabelText('Delete channel'));
    expect(mockDeleteChannel).toHaveBeenCalledTimes(1);
  });
});
