import { Stack } from 'expo-router';
import { BRAND_STACK_OPTIONS } from '../../../src/navigation/stack-options';

export const unstable_settings = { initialRouteName: 'index' };

export default function MoreLayout() {
  return (
    <Stack screenOptions={BRAND_STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="roster/index" options={{ title: 'Roster' }} />
      <Stack.Screen name="practices/index" options={{ title: 'Practices' }} />
      <Stack.Screen name="practices/new" options={{ title: 'New practice' }} />
      <Stack.Screen name="practices/[practiceId]/index" options={{ title: 'Practice' }} />
      <Stack.Screen name="practices/[practiceId]/notes" options={{ title: 'Practice notes' }} />
      <Stack.Screen name="practices/[practiceId]/run" options={{ title: 'Run practice' }} />
      <Stack.Screen name="facilities/index" options={{ title: 'Facilities' }} />
      <Stack.Screen name="facilities/new-booking" options={{ title: 'Book a facility' }} />
      <Stack.Screen name="facilities/manage" options={{ title: 'Manage facilities' }} />
      <Stack.Screen name="opponents/index" options={{ title: 'Opponents' }} />
      <Stack.Screen name="opponents/new" options={{ title: 'New opponent' }} />
      <Stack.Screen name="opponents/[opponentTeamId]/index" options={{ title: 'Opponent' }} />
      <Stack.Screen name="opponents/[opponentTeamId]/edit" options={{ title: 'Edit opponent' }} />
      <Stack.Screen name="opponents/[opponentTeamId]/card" options={{ title: 'Scouting card' }} />
    </Stack>
  );
}
