import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { ThemeScope } from '../../src/theme/ThemeScope';

export default function AuthLayout() {
  const { user } = useAuth();

  // If already signed in, go to the main app
  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <ThemeScope theme="light">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="sign-in" />
      </Stack>
    </ThemeScope>
  );
}
