import { Stack } from 'expo-router';
import { brandStackOptions } from '../../../src/navigation/stack-options';
import { useScopeTheme } from '../../../src/theme/ThemeScope';

export const unstable_settings = { initialRouteName: 'index' };

export default function HomeLayout() {
  const theme = useScopeTheme();
  return (
    <Stack screenOptions={brandStackOptions(theme)}>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
    </Stack>
  );
}
