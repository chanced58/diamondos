import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';

type StackScreenOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

/** Brand header shared by every tab's stack. */
export const BRAND_STACK_OPTIONS = {
  headerStyle: { backgroundColor: '#1e3a8a' },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontWeight: '700' },
} satisfies StackScreenOptions;
