import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { SEMANTIC_TOKENS, type ResolvedTheme } from '@baseball/shared';

function themedNavigationTheme(theme: Exclude<ResolvedTheme, 'light'>): Theme {
  const tokens = SEMANTIC_TOKENS[theme];
  return {
    dark: true,
    colors: {
      ...DarkTheme.colors,
      primary: tokens['brand-2'],
      background: tokens.bg,
      card: tokens.surface,
      text: tokens.fg,
      border: tokens.border,
    },
  };
}

// Built once so the provider value keeps a stable identity across renders.
const NAVIGATION_THEMES: Record<ResolvedTheme, Theme> = {
  light: DefaultTheme,
  dark: themedNavigationTheme('dark'),
  dugout: themedNavigationTheme('dugout'),
};

/**
 * React Navigation theme for an app theme. Light is React Navigation's own
 * `DefaultTheme`, unchanged, so Light renders exactly as it did before theming.
 * Dark and Dugout paint screen and card backgrounds from the semantic tokens
 * (the default theme would show white behind any screen that paints nothing,
 * and during transitions).
 */
export function navigationThemeFor(theme: ResolvedTheme): Theme {
  return NAVIGATION_THEMES[theme];
}
