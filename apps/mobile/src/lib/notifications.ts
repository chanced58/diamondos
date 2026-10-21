import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { getSupabaseClient } from './supabase';

// The Expo push token this device registered, so sign-out can remove it.
const PUSH_TOKEN_KEY = 'diamondos.pushToken';

// Configure how notifications are shown when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests push notification permissions and registers the Expo push token
 * with Supabase for this user. Called at startup and whenever a user signs
 * in, since sign-out removes the device's token (`unregisterPushToken`).
 */
export async function registerForPushNotifications(): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Minting a push token requires an EAS project. Check before calling rather
  // than catching after: calling without a projectId also logs a deprecation
  // warning on every launch, which buries real warnings in the dev overlay.
  // Local/dev-client builds aren't linked to an EAS project, so this simply
  // skips registration until one is configured.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.log('Push registration skipped: no EAS projectId configured');
    return;
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (err) {
    console.warn('Push token request failed; skipping registration', err);
    return;
  }

  // Persist token to Supabase
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: Platform.OS as 'ios' | 'android',
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );
  if (error) {
    console.warn('Push token registration failed', error);
    return;
  }

  try {
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  } catch (err) {
    console.warn('Could not remember the push token for sign-out cleanup', err);
  }
}

/**
 * Removes this device's push token for the signed-in user, so a signed-out
 * phone stops receiving their pushes (and the next user to sign in on it
 * doesn't get them either). Must run while the session is still valid —
 * RLS only lets users delete their own tokens. Never throws: sign-out must
 * not be blocked by a failed cleanup.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (!token) return;
    const { error } = await getSupabaseClient().from('push_tokens').delete().eq('token', token);
    if (error) {
      console.warn('Push token cleanup failed; the server may keep sending to this device', error);
      return;
    }
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch (err) {
    console.warn('Push token cleanup threw', err);
  }
}

export interface NotificationData {
  kind?: string;
  practiceId?: string;
  channelId?: string;
  gameId?: string;
}

/** Where a tapped notification opens, from its `data.kind`; null if nowhere. */
export function notificationHref(data: NotificationData | undefined | null): Href | null {
  if (!data) return null;
  if (data.kind === 'pre_practice' && data.practiceId) {
    return {
      pathname: '/(tabs)/more/practices/[practiceId]/card',
      params: { practiceId: data.practiceId },
    };
  }
  if (data.kind === 'message' && data.channelId) {
    return {
      pathname: '/(tabs)/messages/[channelId]',
      params: { channelId: data.channelId },
    };
  }
  if (data.kind === 'game' && data.gameId) {
    return {
      pathname: '/(tabs)/schedule/games/[gameId]/score',
      params: { gameId: data.gameId },
    };
  }
  return null;
}

let deepLinkSubscription: Notifications.Subscription | null = null;
// Responses already routed, so the launch response is never opened twice
// (it can arrive both from getLastNotificationResponseAsync and the listener).
const routedResponseKeys = new Set<string>();

function responseKey(resp: Notifications.NotificationResponse): string {
  return `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
}

function routeNotificationResponse(resp: Notifications.NotificationResponse): void {
  const key = responseKey(resp);
  if (routedResponseKeys.has(key)) return;
  routedResponseKeys.add(key);
  const href = notificationHref(resp.notification.request.content.data as NotificationData | undefined);
  if (href) router.push(href);
}

/**
 * Routes tapped push notifications to the right in-app screen based on the
 * `data.kind` field — including the tap that launched the app from cold,
 * which the listener never sees. Safe to call multiple times — subsequent
 * calls replace the previous listener.
 */
export function setupNotificationDeepLinks(): void {
  deepLinkSubscription?.remove();
  deepLinkSubscription = Notifications.addNotificationResponseReceivedListener(routeNotificationResponse);

  Notifications.getLastNotificationResponseAsync()
    .then((resp) => {
      if (resp) routeNotificationResponse(resp);
    })
    .catch((err) => console.warn('Could not read the notification that opened the app', err));
}
