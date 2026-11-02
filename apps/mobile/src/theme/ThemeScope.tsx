import { createContext, useContext, useMemo, type ReactNode } from 'react';
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

const FILL: ViewStyle = { flex: 1 };

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
  /**
   * Whether this scope drives the status bar (default true). Pass false for a
   * scope that differs from the surrounding chrome (e.g. the Light scorer under
   * a themed header), so it doesn't push the wrong status bar style.
   */
  statusBar?: boolean;
}

/** Applies a theme's CSS variables to a subtree. Scopes nest; the innermost wins. */
export function ThemeScope({ theme, children, style, statusBar = true }: ThemeScopeProps) {
  // Memoized so re-renders keep the same style identity instead of rebuilding
  // the ~420-variable context.
  const scopeStyle = useMemo(() => [FILL, VARS[theme], style], [theme, style]);

  return (
    <ScopeContext.Provider value={theme}>
      <View style={scopeStyle}>
        {statusBar ? <StatusBar style={theme === 'light' ? 'dark' : 'light'} /> : null}
        {children}
      </View>
    </ScopeContext.Provider>
  );
}
