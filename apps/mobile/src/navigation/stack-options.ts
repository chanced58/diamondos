import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';
import { SEMANTIC_TOKENS, type ResolvedTheme } from '@baseball/shared';

type StackScreenOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

const LIGHT_BRAND_STACK_OPTIONS = {
  headerStyle: { backgroundColor: '#1e3a8a' },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontWeight: '700' },
} satisfies StackScreenOptions;

// Built once per theme so screenOptions keeps a stable identity across renders.
const THEMED_BRAND_STACK_OPTIONS = {
  dark: themedOptions('dark'),
  dugout: themedOptions('dugout'),
} satisfies Record<Exclude<ResolvedTheme, 'light'>, StackScreenOptions>;

function themedOptions(theme: Exclude<ResolvedTheme, 'light'>) {
  return {
    headerStyle: { backgroundColor: SEMANTIC_TOKENS[theme].surface },
    headerTintColor: SEMANTIC_TOKENS[theme].fg,
    headerTitleStyle: { fontWeight: '700' },
    headerShadowVisible: false,
  } satisfies StackScreenOptions;
}

/**
 * Header shared by every tab's stack. Light keeps the navy brand bar; Dark and
 * Dugout use the theme's surface so the header sits with the rest of the chrome.
 */
export function brandStackOptions(theme: ResolvedTheme): StackScreenOptions {
  return theme === 'light' ? LIGHT_BRAND_STACK_OPTIONS : THEMED_BRAND_STACK_OPTIONS[theme];
}
