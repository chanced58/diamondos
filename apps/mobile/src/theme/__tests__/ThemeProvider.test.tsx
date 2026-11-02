import { act, render, waitFor } from '@testing-library/react-native';
import { Appearance, AppState, Text } from 'react-native';
import { ThemeProvider, useThemePreference } from '../ThemeProvider';
import * as storage from '../theme-storage';

jest.mock('../theme-storage', () => ({
  loadThemePreference: jest.fn(),
  saveThemePreference: jest.fn(),
}));

const loadThemePreference = storage.loadThemePreference as jest.Mock;
const saveThemePreference = storage.saveThemePreference as jest.Mock;

type Api = ReturnType<typeof useThemePreference>;
type Scheme = 'light' | 'dark' | null;

/**
 * Fakes the native appearance layer. Like the real one, `getColorScheme` returns
 * the app's override while one is set, and the OS scheme otherwise.
 */
function setup(initialOs: Scheme) {
  const env = { os: initialOs, override: null as Scheme, appState: 'active' };
  let changeListener: (prefs: { colorScheme: Scheme }) => void = () => undefined;
  let appStateListener: (state: string) => void = () => undefined;
  const removeAppearance = jest.fn();
  const removeAppState = jest.fn();

  jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => env.override ?? env.os);
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation((scheme) => {
    env.override = scheme ?? null;
    // Native reports a new override at once; the event for clearing one arrives
    // later (a trait change), so it is not delivered here.
    if (scheme) changeListener({ colorScheme: scheme });
  });
  jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
    changeListener = listener as typeof changeListener;
    return { remove: removeAppearance };
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: string) => void,
  ) => {
    appStateListener = listener;
    return { remove: removeAppState };
  }) as never);
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => env.appState });

  const api: { current: Api } = { current: undefined as unknown as Api };

  function Reader() {
    api.current = useThemePreference();
    return <Text>reader</Text>;
  }

  const utils = render(
    <ThemeProvider>
      <Reader />
    </ThemeProvider>,
  );
  return {
    api,
    removeAppearance,
    removeAppState,
    unmount: utils.unmount,
    /** The OS flips its scheme and RN emits the change event. */
    osFlipsTo(next: 'light' | 'dark') {
      env.os = next;
      act(() => changeListener({ colorScheme: env.override ?? next }));
    },
    /** A change event as RN would deliver it, whatever the OS really is. */
    emitChange(next: 'light' | 'dark') {
      act(() => changeListener({ colorScheme: next }));
    },
    /** The app moves between active, inactive and background. */
    appStateBecomes(next: 'active' | 'inactive' | 'background') {
      env.appState = next;
      act(() => appStateListener(next));
    },
  };
}

describe('ThemeProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: undefined });
  });

  beforeEach(() => {
    loadThemePreference.mockReset();
    saveThemePreference.mockReset();
    saveThemePreference.mockResolvedValue(undefined);
  });

  it('should not be ready until storage resolves', async () => {
    let resolveLoad: (p: 'system') => void = () => undefined;
    loadThemePreference.mockReturnValue(new Promise((r) => (resolveLoad = r)));

    const { api } = setup('light');
    expect(api.current.ready).toBe(false);

    await act(async () => {
      resolveLoad('system');
    });
    expect(api.current.ready).toBe(true);
  });

  it('should follow the system scheme live when the preference is system', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api, osFlipsTo } = setup('dark');
    await waitFor(() => expect(api.current.ready).toBe(true));

    expect(api.current.themePreference).toBe('system');
    expect(api.current.resolvedTheme).toBe('dark');

    osFlipsTo('light');
    expect(api.current.resolvedTheme).toBe('light');
    osFlipsTo('dark');
    expect(api.current.resolvedTheme).toBe('dark');
  });

  it('should ignore scheme changes delivered while the app is backgrounded', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api, osFlipsTo, appStateBecomes } = setup('dark');
    await waitFor(() => expect(api.current.ready).toBe(true));

    // iOS takes a light and a dark snapshot for the app switcher.
    appStateBecomes('inactive');
    osFlipsTo('light');
    expect(api.current.resolvedTheme).toBe('dark');
    appStateBecomes('background');
    osFlipsTo('dark');
    osFlipsTo('light');
    osFlipsTo('dark');
    expect(api.current.resolvedTheme).toBe('dark');
  });

  it('should re-read and apply the scheme when the app becomes active', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api, osFlipsTo, appStateBecomes } = setup('dark');
    await waitFor(() => expect(api.current.ready).toBe(true));

    appStateBecomes('background');
    // The user switches the OS to light while the app is away.
    osFlipsTo('light');
    expect(api.current.resolvedTheme).toBe('dark');

    appStateBecomes('active');
    expect(api.current.resolvedTheme).toBe('light');
  });

  it('should keep the settled scheme when the app comes back after a snapshot round trip', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api, osFlipsTo, appStateBecomes } = setup('dark');
    await waitFor(() => expect(api.current.ready).toBe(true));

    appStateBecomes('background');
    osFlipsTo('light');
    osFlipsTo('dark');
    appStateBecomes('active');

    expect(api.current.resolvedTheme).toBe('dark');
  });

  it('should follow the OS again after returning to the foreground', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api, osFlipsTo, appStateBecomes } = setup('dark');
    await waitFor(() => expect(api.current.ready).toBe(true));

    appStateBecomes('background');
    appStateBecomes('active');
    osFlipsTo('light');

    expect(api.current.resolvedTheme).toBe('light');
  });

  it('should pick up the real OS scheme when switching from an explicit choice to system', async () => {
    loadThemePreference.mockResolvedValue('dark');
    const { api } = setup('light');
    await waitFor(() => expect(api.current.ready).toBe(true));
    // While the override is set the native layer reports the override, not the OS.
    expect(api.current.resolvedTheme).toBe('dark');

    act(() => api.current.setThemePreference('system'));

    expect(api.current.resolvedTheme).toBe('light');
  });

  it('should stop listening when unmounted', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api, unmount, removeAppearance, removeAppState } = setup('light');
    await waitFor(() => expect(api.current.ready).toBe(true));

    unmount();

    expect(removeAppearance).toHaveBeenCalled();
    expect(removeAppState).toHaveBeenCalled();
  });

  it('should treat a null system scheme as light', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api } = setup(null);
    await waitFor(() => expect(api.current.ready).toBe(true));

    expect(api.current.resolvedTheme).toBe('light');
  });

  it('should keep an explicit light preference when the system is dark', async () => {
    loadThemePreference.mockResolvedValue('light');
    const { api, emitChange, appStateBecomes } = setup('dark');
    await waitFor(() => expect(api.current.ready).toBe(true));

    expect(api.current.resolvedTheme).toBe('light');

    emitChange('light');
    emitChange('dark');
    expect(api.current.resolvedTheme).toBe('light');

    appStateBecomes('background');
    appStateBecomes('active');
    emitChange('dark');
    expect(api.current.resolvedTheme).toBe('light');
  });

  it('should resolve and persist a newly chosen preference', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api } = setup('light');
    await waitFor(() => expect(api.current.ready).toBe(true));

    act(() => {
      api.current.setThemePreference('dugout');
    });

    expect(api.current.themePreference).toBe('dugout');
    expect(api.current.resolvedTheme).toBe('dugout');
    expect(saveThemePreference).toHaveBeenCalledWith('dugout');
  });

  it('should not let a late storage load override a choice made before it resolved', async () => {
    let resolveLoad: (p: 'dark') => void = () => undefined;
    loadThemePreference.mockReturnValue(new Promise((r) => (resolveLoad = r)));
    const { api } = setup('light');

    act(() => {
      api.current.setThemePreference('dugout');
    });
    await act(async () => {
      resolveLoad('dark');
    });

    expect(api.current.themePreference).toBe('dugout');
    expect(api.current.ready).toBe(true);
  });

  describe('native appearance override', () => {
    let setColorScheme: jest.SpyInstance;

    beforeEach(() => {
      setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
    });

    it.each([
      ['light', 'light'],
      ['dark', 'dark'],
      ['dugout', 'dark'],
      ['system', null],
    ] as const)('should set the native scheme for a stored %s preference to %s', async (stored, expected) => {
      loadThemePreference.mockResolvedValue(stored);
      const { api } = setup('light');
      await waitFor(() => expect(api.current.ready).toBe(true));

      expect(setColorScheme).toHaveBeenLastCalledWith(expected);
    });

    it('should not touch the native scheme before the stored preference is read', async () => {
      let resolveLoad: (p: 'dark') => void = () => undefined;
      loadThemePreference.mockReturnValue(new Promise((r) => (resolveLoad = r)));
      const { api } = setup('light');

      expect(setColorScheme).not.toHaveBeenCalled();

      await act(async () => {
        resolveLoad('dark');
      });

      expect(api.current.ready).toBe(true);
      expect(setColorScheme).toHaveBeenCalledTimes(1);
      expect(setColorScheme).toHaveBeenCalledWith('dark');
    });

    it('should hand control back to the OS when switching from dark to system', async () => {
      loadThemePreference.mockResolvedValue('dark');
      const { api } = setup('light');
      await waitFor(() => expect(api.current.ready).toBe(true));
      expect(setColorScheme).toHaveBeenLastCalledWith('dark');

      act(() => {
        api.current.setThemePreference('system');
      });

      expect(setColorScheme).toHaveBeenLastCalledWith(null);
    });

    it('should follow each explicit choice made after load', async () => {
      loadThemePreference.mockResolvedValue('system');
      const { api } = setup('dark');
      await waitFor(() => expect(api.current.ready).toBe(true));

      act(() => api.current.setThemePreference('light'));
      expect(setColorScheme).toHaveBeenLastCalledWith('light');

      act(() => api.current.setThemePreference('dugout'));
      expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    });
  });
});
