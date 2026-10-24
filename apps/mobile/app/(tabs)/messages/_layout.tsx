import { Stack } from 'expo-router';
import { BRAND_STACK_OPTIONS } from '../../../src/navigation/stack-options';

export const unstable_settings = { initialRouteName: 'index' };

export default function MessagesLayout() {
  return (
    <Stack screenOptions={BRAND_STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'Messages' }} />
      <Stack.Screen name="new" options={{ title: 'New channel' }} />
      <Stack.Screen name="new-dm" options={{ title: 'New message' }} />
    </Stack>
  );
}
