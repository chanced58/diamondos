import { useCallback } from 'react';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';

/**
 * Opening a detail screen in ANOTHER tab's stack, with that tab's list
 * underneath it.
 *
 * `router.push('/(tabs)/schedule/games/[gameId]')` from Home switches tabs, but
 * expo-router 3 sends only the target screen in its navigate action. When the
 * Schedule stack hasn't been opened yet, that screen becomes the stack's only
 * route: no back button, and no way to the schedule list (tapping the tab
 * pops to a "top" that is the same screen). React Navigation's `initial:
 * false` makes the stack start from its `initialRouteName` and push the screen
 * on top, which expo-router's `router` cannot express.
 */

/** The tab navigator's route names (`app/(tabs)/_layout.tsx`). */
export type TabName = '(home)' | 'schedule' | 'messages' | 'stats' | 'more';

export interface TabScreen {
  tab: TabName;
  /** The screen's route name inside the tab's stack, e.g. `games/[gameId]/index`. */
  screen: string;
  params: Record<string, string>;
}

/** A game's screen in the Schedule tab: its page, or one of its sub-screens. */
export function gameScreen(gameId: string, view: 'index' | 'live' | 'lineup' | 'score' = 'index'): TabScreen {
  return { tab: 'schedule', screen: `games/[gameId]/${view}`, params: { gameId } };
}

export function eventScreen(eventId: string): TabScreen {
  return { tab: 'schedule', screen: 'events/[eventId]', params: { eventId } };
}

export function practiceScreen(practiceId: string): TabScreen {
  return { tab: 'more', screen: 'practices/[practiceId]/index', params: { practiceId } };
}

export function channelScreen(channelId: string): TabScreen {
  return { tab: 'messages', screen: '[channelId]', params: { channelId } };
}

/** The tab navigator's `navigate` arguments for a screen in one of its stacks. */
export function tabNavigateArgs(target: TabScreen): [TabName, { screen: string; params: Record<string, string>; initial: false }] {
  return [target.tab, { screen: target.screen, params: target.params, initial: false }];
}

/** The nearest navigator above (or at) `navigation` whose state is a tab navigator's. */
export function findTabNavigator(
  navigation: NavigationProp<ParamListBase> | undefined,
): NavigationProp<ParamListBase> | undefined {
  let current = navigation;
  while (current) {
    if (current.getState()?.type === 'tab') return current;
    current = current.getParent();
  }
  return undefined;
}

export function openInTab(navigation: NavigationProp<ParamListBase>, target: TabScreen): void {
  const tabs = findTabNavigator(navigation);
  if (!tabs) {
    // Every caller sits under the tab navigator; reaching here means the
    // layout changed, and a silent no-op is what this helper exists to stop.
    console.warn(`[openInTab] no tab navigator above the current screen; tab=${target.tab} screen=${target.screen}`);
    return;
  }
  tabs.navigate(...tabNavigateArgs(target));
}

/** `openInTab` bound to the calling screen's navigation. */
export function useOpenInTab(): (target: TabScreen) => void {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return useCallback((target: TabScreen) => openInTab(navigation, target), [navigation]);
}
