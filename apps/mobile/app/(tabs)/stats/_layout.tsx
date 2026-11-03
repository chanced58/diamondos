import { Stack } from 'expo-router';
import { brandStackOptions } from '../../../src/navigation/stack-options';
import { useScopeTheme } from '../../../src/theme/ThemeScope';

export const unstable_settings = { initialRouteName: 'index' };

export default function StatsLayout() {
  const theme = useScopeTheme();
  return (
    <Stack screenOptions={brandStackOptions(theme)}>
      <Stack.Screen name="index" options={{ title: 'Stats' }} />
      <Stack.Screen name="league" options={{ title: 'League stats' }} />
      <Stack.Screen name="league-teams" options={{ title: 'Team comparison' }} />
      <Stack.Screen name="bullpen" options={{ title: 'Bullpen planner' }} />
      <Stack.Screen name="pitcher/[playerId]" options={{ title: 'Pitcher' }} />
      <Stack.Screen name="opponent/[opponentTeamId]" options={{ title: 'Opponent' }} />
    </Stack>
  );
}
