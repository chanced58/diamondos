'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@baseball/shared';
import { buildAppearanceBootstrapScript } from '@/lib/theme/bootstrap-script';
import { isThemedPath } from '@/lib/theme/themed-paths';

export type Density = 'compact' | 'comfortable' | 'spacious';
export type Motion = 'on' | 'off';
export type Tone = 'utilitarian' | 'editorial' | 'energetic';

const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
const MOTIONS   = ['on', 'off'] as const;
const TONES     = ['utilitarian', 'editorial', 'energetic'] as const;

// Layout effect so attributes change before paint (client navigation commits as a
// transition, and passive effects can run after the browser paints). SSR-safe.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const DARK_QUERY = '(prefers-color-scheme: dark)';

type Prefs = {
  themePreference: ThemePreference;
  density: Density;
  motion: Motion;
  tone: Tone;
};

const DEFAULT_PREFS: Prefs = {
  themePreference: DEFAULT_THEME_PREFERENCE,
  density: 'comfortable',
  motion: 'on',
  tone: 'editorial',
};

const STORAGE_KEYS = {
  themePreference: 'dos_theme',
  density: 'dos_density',
  motion: 'dos_motion',
  tone: 'dos_tone',
} as const;

type AppearanceContextValue = Prefs & {
  /** The theme currently on `<html data-theme>`: the preference resolved for the current route. */
  appliedTheme: ResolvedTheme;
  setThemePreference: (p: ThemePreference) => void;
  setDensity: (d: Density) => void;
  setMotion: (m: Motion) => void;
  setTone: (t: Tone) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function applyAttrs(theme: ResolvedTheme, prefs: Prefs): void {
  const el = document.documentElement;
  el.setAttribute('data-theme', theme);
  el.setAttribute('data-density', prefs.density);
  el.setAttribute('data-motion', prefs.motion);
  el.setAttribute('data-tone', prefs.tone);
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function getDarkQuery(): MediaQueryList | null {
  try {
    return window.matchMedia?.(DARK_QUERY) ?? null;
  } catch {
    return null;
  }
}

function readSystemPrefersDark(): boolean {
  return getDarkQuery()?.matches ?? false;
}

function readInitialPrefs(serverPrefs?: Partial<Prefs>): Prefs {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFS, ...serverPrefs };
  }
  let reducedMotion = false;
  try {
    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    reducedMotion = false;
  }

  const stored = safeRead(STORAGE_KEYS.themePreference);
  const themePreference = stored !== null
    ? parseThemePreference(stored)
    : serverPrefs?.themePreference ?? DEFAULT_PREFS.themePreference;
  const density = pick(safeRead(STORAGE_KEYS.density), DENSITIES, serverPrefs?.density ?? DEFAULT_PREFS.density);
  const storedMotion = safeRead(STORAGE_KEYS.motion);
  const motionDefault: Motion = serverPrefs?.motion ?? (reducedMotion ? 'off' : DEFAULT_PREFS.motion);
  const motion = pick(storedMotion, MOTIONS, motionDefault);
  const tone    = pick(safeRead(STORAGE_KEYS.tone),    TONES,     serverPrefs?.tone    ?? DEFAULT_PREFS.tone);

  return { themePreference, density, motion, tone };
}

export function ThemeProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<Prefs>;
}): JSX.Element {
  const pathname = usePathname() ?? '';
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...initial }));
  const [systemDark, setSystemDark] = useState(false);
  // Until the first client read, the bootstrap script's attributes on <html> stand;
  // applying defaults earlier would flash the wrong theme.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(readInitialPrefs(initial));
    setSystemDark(readSystemPrefersDark());
    setHydrated(true);
  }, [initial]);

  const appliedTheme: ResolvedTheme = isThemedPath(pathname)
    ? resolveTheme(prefs.themePreference, systemDark)
    : 'light';

  useIsoLayoutEffect(() => {
    if (!hydrated) return;
    applyAttrs(appliedTheme, prefs);
  }, [hydrated, appliedTheme, prefs]);

  // Follow OS changes live, only while System is selected.
  useEffect(() => {
    if (!hydrated || prefs.themePreference !== 'system') return undefined;
    const mql = getDarkQuery();
    if (!mql) return undefined;
    const onChange = (e: { matches: boolean }): void => setSystemDark(e.matches);
    setSystemDark(mql.matches);
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener?.(onChange);
    return () => mql.removeListener?.(onChange);
  }, [hydrated, prefs.themePreference]);

  const update = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    try {
      localStorage.setItem(STORAGE_KEYS[key], value as string);
    } catch {
      // ignore quota / private mode
    }
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...prefs,
      appliedTheme,
      setThemePreference: (p) => update('themePreference', p),
      setDensity: (d) => update('density', d),
      setMotion: (m) => update('motion', m),
      setTone: (t) => update('tone', t),
    }),
    [prefs, appliedTheme, update],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useAppearance must be used within ThemeProvider');
  }
  return ctx;
}

// Pre-paint inline script. See buildAppearanceBootstrapScript; it mirrors
// readInitialPrefs and the route scoping so the server-rendered <html data-*>
// never desyncs from the hydrated state.
export function AppearanceBootstrap(): JSX.Element {
  return <script dangerouslySetInnerHTML={{ __html: buildAppearanceBootstrapScript() }} />;
}
