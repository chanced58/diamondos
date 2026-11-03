import type { ReactNode } from 'react';
import { ThemeProvider } from '@react-navigation/native';
import { useScopeTheme } from '../theme/ThemeScope';
import { navigationThemeFor } from './navigation-theme';

/**
 * Gives the navigators below it the React Navigation theme of the nearest
 * `ThemeScope`. Place it just inside a scope, around a navigator: the root
 * stack, and inside the Light `(auth)` scope so its stack stays on the default
 * theme under a Dark root.
 */
export function NavigationThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider value={navigationThemeFor(useScopeTheme())}>{children}</ThemeProvider>;
}
