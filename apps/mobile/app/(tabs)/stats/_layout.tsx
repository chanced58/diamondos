import { Stack } from 'expo-router';
import { BRAND_STACK_OPTIONS } from '../../../src/navigation/stack-options';

export const unstable_settings = { initialRouteName: 'index' };

export default function StatsLayout() {
  return (
    <Stack screenOptions={BRAND_STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'Stats' }} />
    </Stack>
  );
}
