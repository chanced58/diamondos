import { Stack } from 'expo-router';
import { BRAND_STACK_OPTIONS } from '../../../src/navigation/stack-options';

/**
 * The Schedule tab is a stack, not a pile of sibling tab routes.
 *
 * score, lineup and attendance used to be registered directly on the tab
 * navigator with `href: null`. Pushing between them switched tabs instead of
 * pushing, so none of them got a back button or the interactive swipe-back —
 * the lineup editor was reachable mid-game and then had no way home.
 *
 * initialRouteName seeds the list underneath a detail screen, so arriving by
 * deep link or from another tab (Home, a push notification) still leaves
 * somewhere to go back to.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function ScheduleLayout() {
  return (
    <Stack screenOptions={BRAND_STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'Schedule' }} />
    </Stack>
  );
}
