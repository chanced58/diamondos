import { Stack } from 'expo-router';
import { brandStackOptions } from '../../../src/navigation/stack-options';
import { useScopeTheme } from '../../../src/theme/ThemeScope';

export const unstable_settings = { initialRouteName: 'index' };

export default function MessagesLayout() {
  const theme = useScopeTheme();
  return (
    <Stack screenOptions={brandStackOptions(theme)}>
      <Stack.Screen name="index" options={{ title: 'Messages' }} />
      <Stack.Screen name="new" options={{ title: 'New channel' }} />
      <Stack.Screen name="new-dm" options={{ title: 'New message' }} />
      <Stack.Screen name="league/[channelId]" options={{ title: 'League channel' }} />
    </Stack>
  );
}
