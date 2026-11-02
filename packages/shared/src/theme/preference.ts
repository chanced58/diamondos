import type { ResolvedTheme } from './palette';

/** User-selectable theme. `system` follows the OS and resolves to light or dark only. */
export type ThemePreference = 'system' | ResolvedTheme;

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark', 'dugout'];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

/** Parse a stored value; anything unknown (corrupt, old, future) falls back to `system`. */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return (THEME_PREFERENCES as readonly (string | null | undefined)[]).includes(raw)
    ? (raw as ThemePreference)
    : DEFAULT_THEME_PREFERENCE;
}

/** Resolve a preference to a concrete theme. Explicit choices ignore the system flag. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
