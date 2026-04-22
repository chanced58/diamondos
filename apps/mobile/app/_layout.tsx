import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { RoleProvider } from '../src/providers/RoleProvider';
import { SyncProvider } from '../src/providers/SyncProvider';
import { database } from '../src/db';
import { registerForPushNotifications } from '../src/lib/notifications';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
      registerForPushNotifications().catch(console.warn);
    }
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="(modals)/lineup-editor"
        options={{ presentation: 'modal', headerShown: true, title: 'Set Lineup' }}
      />
      <Stack.Screen
        name="(modals)/substitution"
        options={{ presentation: 'modal', headerShown: true, title: 'Substitution' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider database={database}>
      <AuthProvider>
        <RoleProvider>
          <SyncProvider>
            <RootLayoutNav />
          </SyncProvider>
        </RoleProvider>
      </AuthProvider>
    </DatabaseProvider>
  );
}
