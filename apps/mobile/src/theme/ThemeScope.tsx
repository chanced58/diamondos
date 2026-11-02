import { createContext, useContext, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { vars } from 'nativewind';
import { buildThemeVars, SEMANTIC_TOKENS } from '@baseball/shared';
import type { ResolvedTheme, SemanticToken } from '@baseball/shared';

// Built once: `vars()` output is a stable style object per theme.
const VARS: Record<ResolvedTheme, ReturnType<typeof vars>> = {
  light: vars(buildThemeVars('light')),
  dark: vars(buildThemeVars('dark')),
  dugout: vars(buildThemeVars('dugout')),
};

const ScopeContext = createContext<ResolvedTheme>('light');

/** The theme of the nearest enclosing `ThemeScope` (`'light'` outside any). */
export function useScopeTheme(): ResolvedTheme {
  return useContext(ScopeContext);
}

/** Hex values for the nearest scope, for places a className cannot reach (icons, navigators). */
export function useThemeColors(): Record<SemanticToken, string> {
  return SEMANTIC_TOKENS[useScopeTheme()];
}

interface ThemeScopeProps {
  theme: ResolvedTheme;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Applies a theme's CSS variables to a subtree. Scopes nest; the innermost wins. */
export function ThemeScope({ theme, children, style }: ThemeScopeProps) {
  return (
    <ScopeContext.Provider value={theme}>
      <View style={[{ flex: 1 }, VARS[theme], style]}>
        <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
        {children}
      </View>
    </ScopeContext.Provider>
  );
}
