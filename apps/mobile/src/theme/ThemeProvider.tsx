import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, AppState } from 'react-native';
import {
  DEFAULT_THEME_PREFERENCE,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@baseball/shared';
import { ThemeScope } from './ThemeScope';
import { loadThemePreference, saveThemePreference } from './theme-storage';

interface ThemePreferenceValue {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (preference: ThemePreference) => void;
  /** False until the stored preference has been read; hold the splash screen until then. */
  ready: boolean;
}

const ThemePreferenceContext = createContext<ThemePreferenceValue>({
  themePreference: DEFAULT_THEME_PREFERENCE,
  resolvedTheme: 'light',
  setThemePreference: () => undefined,
  ready: true,
});

export function useThemePreference(): ThemePreferenceValue {
  return useContext(ThemePreferenceContext);
}

const isDarkScheme = () => Appearance.getColorScheme() === 'dark';

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The OS scheme, tracked by hand rather than with `useColorScheme()`: while the
  // app is backgrounded, iOS takes a light and a dark snapshot for the app
  // switcher and RN reports both flips, which would re-theme the whole tree twice
  // behind the user's back. Changes are applied only while the app is active, and
  // the scheme is re-read when it becomes active again.
  const [systemDark, setSystemDark] = useState(isDarkScheme);
  const [themePreference, setPreference] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [ready, setReady] = useState(false);
  // A choice made before the stored value arrives must win over the late load.
  const chosenBeforeLoad = useRef(false);

  useEffect(() => {
    const appearanceSub = Appearance.addChangeListener(({ colorScheme }) => {
      if (AppState.currentState === 'active') setSystemDark(colorScheme === 'dark');
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setSystemDark(isDarkScheme());
    });
    return () => {
      appearanceSub.remove();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadThemePreference()
      .then((stored) => {
        if (active && !chosenBeforeLoad.current) setPreference(stored);
      })
      .catch((error) => console.warn('[theme] unexpected load failure', error))
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Native chrome (keyboards, Alerts, pickers, Switches, scroll indicators) draws
  // from the OS interface style, which `userInterfaceStyle: automatic` leaves to
  // the device. Pin it to the app's choice; null hands control back to the OS.
  // Only after the stored value is read, so a default never overrides it.
  useEffect(() => {
    if (!ready) return;
    if (themePreference === 'system') {
      Appearance.setColorScheme(null);
      // While an override is set `getColorScheme()` returns the override, so the
      // tracked value is stale on the first System render after an explicit choice.
      // Re-read it now that the override is gone instead of waiting for a change
      // event; that render can show the old scheme for one frame, which we accept.
      setSystemDark(isDarkScheme());
    } else {
      Appearance.setColorScheme(themePreference === 'light' ? 'light' : 'dark');
    }
  }, [ready, themePreference]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    chosenBeforeLoad.current = true;
    setPreference(preference);
    // Persistence failures are logged inside; the in-memory choice stays.
    void saveThemePreference(preference);
  }, []);

  const resolvedTheme = resolveTheme(themePreference, systemDark);

  const value = useMemo(
    () => ({ themePreference, resolvedTheme, setThemePreference, ready }),
    [themePreference, resolvedTheme, setThemePreference, ready],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      <ThemeScope theme={resolvedTheme}>{children}</ThemeScope>
    </ThemePreferenceContext.Provider>
  );
}
