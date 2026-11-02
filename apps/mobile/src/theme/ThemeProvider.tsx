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
import { useColorScheme } from 'react-native';
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themePreference, setPreference] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [ready, setReady] = useState(false);
  // A choice made before the stored value arrives must win over the late load.
  const chosenBeforeLoad = useRef(false);

  useEffect(() => {
    let active = true;
    loadThemePreference().then((stored) => {
      if (!active) return;
      if (!chosenBeforeLoad.current) setPreference(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    chosenBeforeLoad.current = true;
    setPreference(preference);
    // Persistence failures are logged inside; the in-memory choice stays.
    void saveThemePreference(preference);
  }, []);

  const resolvedTheme = resolveTheme(themePreference, systemScheme === 'dark');

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
