import { render, screen, waitFor } from '@testing-library/react-native';
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

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options: _options }: { options: unknown }) => null,
  },
  useLocalSearchParams: () => ({ channelId: 'channel-123' }),
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
        return <Component {...observables} />;
      };
    };
});

// Require must come after jest.mock() calls to ensure mocks are set up before the module loads
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ChannelScreen = require('../[channelId]').default;

describe('MessageThread — ListEmptyComponent (W9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = [];
    mockChannelData = mockChannel;
  });

  it('should render "No messages yet." when channel is empty', async () => {
    mockMessages = [];
    render(<ChannelScreen />);

    await waitFor(
      () => {
        expect(screen.queryByText('No messages yet.')).toBeTruthy();
      },
      { timeout: 1000 },
    );
  });

  it('should not render "No messages yet." when channel has messages', async () => {
    mockMessages = [mockMessage];
    render(<ChannelScreen />);

    // The message should be rendered
    await waitFor(() => {
      expect(screen.queryByText('Hello world')).toBeTruthy();
    });

    // Empty state should not appear
    expect(screen.queryByText('No messages yet.')).toBeFalsy();
  });
});
