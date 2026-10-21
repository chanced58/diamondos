import { Stack } from 'expo-router';
import { BRAND_STACK_OPTIONS } from '../../../src/navigation/stack-options';

export const unstable_settings = { initialRouteName: 'index' };

export default function MoreLayout() {
  return (
    <Stack screenOptions={BRAND_STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="roster/index" options={{ title: 'Roster' }} />
      <Stack.Screen name="practices/index" options={{ title: 'Practices' }} />
    </Stack>
  );
}
