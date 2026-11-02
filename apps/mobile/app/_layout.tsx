import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { QueryProvider } from '../src/providers/QueryProvider';
import { RoleProvider } from '../src/providers/RoleProvider';
import { SyncProvider } from '../src/providers/SyncProvider';
import { database } from '../src/db';
import { ThemeProvider, useThemePreference } from '../src/theme/ThemeProvider';
import {
  registerForPushNotifications,
  setupNotificationDeepLinks,
} from '../src/lib/notifications';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { loading, user } = useAuth();
  const { ready: themeReady } = useThemePreference();
  const appReady = !loading && themeReady;

  // Splash stays up until auth and the stored theme are both known, so a
  // saved Dark/Dugout choice never flashes Light on cold start.
  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  // Runs in the same commit that mounts the Stack: a cold-start notification
  // tap can't navigate before the root layout exists.
  useEffect(() => {
    if (appReady) {
      setupNotificationDeepLinks();
    }
  }, [appReady]);

  // Per signed-in user: sign-out removes the device's push token, so a
  // sign-in during the same session has to register it again.
  useEffect(() => {
    if (!loading && user) {
      registerForPushNotifications().catch(console.warn);
    }
  }, [loading, user?.id]);

  if (!appReady) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth-callback" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <DatabaseProvider database={database}>
        <AuthProvider>
          <QueryProvider>
            <RoleProvider>
              <SyncProvider>
                <RootLayoutNav />
              </SyncProvider>
            </RoleProvider>
          </QueryProvider>
        </AuthProvider>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
