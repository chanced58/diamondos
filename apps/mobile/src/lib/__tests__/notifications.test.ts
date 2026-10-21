import * as SecureStore from 'expo-secure-store';

const mockPush = jest.fn();
let mockListener: ((resp: unknown) => void) | null = null;
const mockGetLastResponse = jest.fn();
const mockDeleteEq = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: (listener: (resp: unknown) => void) => {
    mockListener = listener;
    return { remove: jest.fn() };
  },
  getLastNotificationResponseAsync: () => mockGetLastResponse(),
}));
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('expo-constants', () => ({}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('../supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({ delete: () => ({ eq: (column: string, value: string) => mockDeleteEq(column, value) }) }),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { notificationHref, setupNotificationDeepLinks, unregisterPushToken } = require('../notifications');

function response(id: string, data: Record<string, string>) {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { request: { identifier: id, content: { data } } },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLastResponse.mockResolvedValue(null);
});

describe('notificationHref', () => {
  it('should route each kind to its screen', () => {
    expect(notificationHref({ kind: 'game', gameId: 'g1' })).toEqual({
      pathname: '/(tabs)/schedule/games/[gameId]/score',
      params: { gameId: 'g1' },
    });
    expect(notificationHref({ kind: 'message', channelId: 'c1' })).toEqual({
      pathname: '/(tabs)/messages/[channelId]',
      params: { channelId: 'c1' },
    });
    expect(notificationHref({ kind: 'pre_practice', practiceId: 'p1' })).toEqual({
      pathname: '/(tabs)/more/practices/[practiceId]/card',
      params: { practiceId: 'p1' },
    });
  });

  it('should open nothing for an unknown kind or a missing id', () => {
    expect(notificationHref({ kind: 'game' })).toBeNull();
    expect(notificationHref({ type: 'pitch_count_alert', gameId: 'g1' } as never)).toBeNull();
    expect(notificationHref(undefined)).toBeNull();
  });
});

describe('setupNotificationDeepLinks', () => {
  it('should route the tap that launched the app from cold', async () => {
    mockGetLastResponse.mockResolvedValue(response('launch', { kind: 'game', gameId: 'g1' }));

    setupNotificationDeepLinks();
    await flush();

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/schedule/games/[gameId]/score', params: { gameId: 'g1' } });
  });

  it('should route a tap while running, and never open the same response twice', async () => {
    const launch = response('warm-launch', { kind: 'message', channelId: 'c1' });
    mockGetLastResponse.mockResolvedValue(launch);

    setupNotificationDeepLinks();
    await flush();
    mockListener!(launch);
    mockListener!(response('later', { kind: 'pre_practice', practiceId: 'p1' }));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/more/practices/[practiceId]/card',
      params: { practiceId: 'p1' },
    });
  });
});

describe('unregisterPushToken', () => {
  it('should delete the stored token and forget it', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('ExponentPushToken[abc]');
    mockDeleteEq.mockResolvedValue({ error: null });

    await unregisterPushToken();

    expect(mockDeleteEq).toHaveBeenCalledWith('token', 'ExponentPushToken[abc]');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('diamondos.pushToken');
  });

  it('should do nothing without a stored token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await unregisterPushToken();

    expect(mockDeleteEq).not.toHaveBeenCalled();
  });

  it('should keep the token for a retry and not throw when the delete fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('ExponentPushToken[abc]');
    mockDeleteEq.mockResolvedValue({ error: { message: 'offline' } });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(unregisterPushToken()).resolves.toBeUndefined();

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
