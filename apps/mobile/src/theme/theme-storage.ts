import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  type ThemePreference,
} from '@baseball/shared';

const STORAGE_KEY = 'dos_theme';

/** Load the per-device theme preference; corrupt or unreadable values fall back to the default. */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    return parseThemePreference(await SecureStore.getItemAsync(STORAGE_KEY));
  } catch (error) {
    console.warn('[theme] failed to read preference', error);
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Persist the preference. Failures are logged, never thrown: the in-memory choice still applies. */
export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, preference);
  } catch (error) {
    console.warn('[theme] failed to save preference', error);
  }
}
