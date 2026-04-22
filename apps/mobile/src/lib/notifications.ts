import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { getSupabaseClient } from './supabase';

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
 * with Supabase for this user. Called once during app startup.
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

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Persist token to Supabase
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: Platform.OS as 'ios' | 'android',
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );
}

let deepLinkSubscription: Notifications.Subscription | null = null;

/**
 * Routes tapped push notifications to the right in-app screen based on the
 * `data.kind` field. Safe to call multiple times — subsequent calls replace
 * the previous listener.
 */
export function setupNotificationDeepLinks(): void {
  deepLinkSubscription?.remove();
  deepLinkSubscription = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as
      | { kind?: string; practiceId?: string }
      | undefined;
    if (!data) return;

    if (data.kind === 'pre_practice' && data.practiceId) {
      router.push(`/(tabs)/practices/${data.practiceId}/card` as never);
    }
  });
}

