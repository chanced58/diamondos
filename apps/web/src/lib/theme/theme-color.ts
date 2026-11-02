import type { ResolvedTheme } from '@baseball/shared';

/**
 * `<meta name="theme-color">` (browser toolbar / PWA status bar) per applied theme.
 * Light is the navy the app shipped with; Dark and Dugout match their page `bg`
 * (`SEMANTIC_TOKENS[theme].bg`). Mirrored by the bootstrap script and ThemeProvider.
 */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#1e3a8a',
  dark: '#0f1115',
  dugout: '#08120a',
};

/** Server-rendered default: Light, as before the dark-mode work. */
export const DEFAULT_THEME_COLOR = THEME_COLORS.light;

/** Point every `theme-color` meta at the applied theme. No-op without one. */
export function applyThemeColor(theme: ResolvedTheme): void {
  try {
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute('content', THEME_COLORS[theme]));
  } catch {
    // no DOM / locked down: the server default stands
  }
}
