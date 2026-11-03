import * as SecureStore from 'expo-secure-store';
import { loadThemePreference, saveThemePreference } from '../theme-storage';

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;

describe('theme-storage', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    getItemAsync.mockReset();
    setItemAsync.mockReset();
    getItemAsync.mockResolvedValue(null);
    setItemAsync.mockResolvedValue(undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('loadThemePreference', () => {
    it('should return the stored preference', async () => {
      getItemAsync.mockResolvedValue('dugout');

      await expect(loadThemePreference()).resolves.toBe('dugout');
      expect(getItemAsync).toHaveBeenCalledWith('dos_theme');
    });

    it('should return system when nothing is stored', async () => {
      getItemAsync.mockResolvedValue(null);

      await expect(loadThemePreference()).resolves.toBe('system');
    });

    it.each(['navy', ''])('should fall back to system for the corrupt value %p', async (raw) => {
      getItemAsync.mockResolvedValue(raw);

      await expect(loadThemePreference()).resolves.toBe('system');
    });

    it('should fall back to system and warn when SecureStore rejects', async () => {
      const error = new Error('keychain locked');
      getItemAsync.mockRejectedValue(error);

      await expect(loadThemePreference()).resolves.toBe('system');
      expect(warn).toHaveBeenCalledWith('[theme] failed to read preference', error);
    });
  });

  describe('saveThemePreference', () => {
    it('should write the preference under dos_theme', async () => {
      await saveThemePreference('dark');

      expect(setItemAsync).toHaveBeenCalledWith('dos_theme', 'dark');
    });

    it('should warn instead of throwing when SecureStore rejects', async () => {
      const error = new Error('disk full');
      setItemAsync.mockRejectedValue(error);

      await expect(saveThemePreference('dark')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith('[theme] failed to save preference', error);
    });
  });
});
