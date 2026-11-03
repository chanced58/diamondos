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

/**
 * Point the `theme-color` meta at the applied theme, creating it if it is missing
 * (the bootstrap script normally has; a client re-render of `<head>` drops it).
 * The meta is never rendered by React: see `buildAppearanceBootstrapScript`.
 */
export function applyThemeColor(theme: ResolvedTheme): void {
  try {
    let metas: ArrayLike<Element> = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 0) {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
      metas = [meta];
    }
    Array.from(metas).forEach((meta) => meta.setAttribute('content', THEME_COLORS[theme]));
  } catch {
    // no DOM / locked down: the browser default stands
  }
}
