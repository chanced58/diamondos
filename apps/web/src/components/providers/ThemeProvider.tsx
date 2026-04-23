'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'dugout';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type Motion = 'on' | 'off';
export type Tone = 'utilitarian' | 'editorial' | 'energetic';

type Prefs = {
  theme: Theme;
  density: Density;
  motion: Motion;
  tone: Tone;
};

const DEFAULT_PREFS: Prefs = {
  theme: 'light',
  density: 'comfortable',
  motion: 'on',
  tone: 'editorial',
};

const STORAGE_KEYS = {
  theme: 'dos_theme',
  density: 'dos_density',
  motion: 'dos_motion',
  tone: 'dos_tone',
} as const;

type AppearanceContextValue = Prefs & {
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setMotion: (m: Motion) => void;
  setTone: (t: Tone) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function applyAttrs(prefs: Prefs): void {
  const el = document.documentElement;
  el.setAttribute('data-theme', prefs.theme);
  el.setAttribute('data-density', prefs.density);
  el.setAttribute('data-motion', prefs.motion);
  el.setAttribute('data-tone', prefs.tone);
}

function readInitialPrefs(serverPrefs?: Partial<Prefs>): Prefs {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFS, ...serverPrefs };
  }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const theme = (localStorage.getItem(STORAGE_KEYS.theme) as Theme | null) ?? serverPrefs?.theme ?? DEFAULT_PREFS.theme;
  const density = (localStorage.getItem(STORAGE_KEYS.density) as Density | null) ?? serverPrefs?.density ?? DEFAULT_PREFS.density;
  const storedMotion = localStorage.getItem(STORAGE_KEYS.motion) as Motion | null;
  const motion: Motion = storedMotion ?? serverPrefs?.motion ?? (reducedMotion ? 'off' : DEFAULT_PREFS.motion);
  const tone = (localStorage.getItem(STORAGE_KEYS.tone) as Tone | null) ?? serverPrefs?.tone ?? DEFAULT_PREFS.tone;
  return { theme, density, motion, tone };
}

export function ThemeProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<Prefs>;
}): JSX.Element {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...initial }));

  useEffect(() => {
    const hydrated = readInitialPrefs(initial);
    setPrefs(hydrated);
    applyAttrs(hydrated);
  }, [initial]);

  useEffect(() => {
    applyAttrs(prefs);
  }, [prefs]);

  const update = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEYS[key], value as string);
      } catch {
        // ignore quota / private mode
      }
      return next;
    });
  }, []);

  const value: AppearanceContextValue = {
    ...prefs,
    setTheme: (t) => update('theme', t),
    setDensity: (d) => update('density', d),
    setMotion: (m) => update('motion', m),
    setTone: (t) => update('tone', t),
  };

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useAppearance must be used within ThemeProvider');
  }
  return ctx;
}

export function AppearanceBootstrap(): JSX.Element {
  return (
    <script
      // Runs before paint to prevent theme flash. Defaults are safe no-ops.
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('dos_theme')||'light';var den=localStorage.getItem('dos_density')||'comfortable';var m=localStorage.getItem('dos_motion');var to=localStorage.getItem('dos_tone')||'editorial';if(!m){m=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'off':'on';}d.setAttribute('data-theme',t);d.setAttribute('data-density',den);d.setAttribute('data-motion',m);d.setAttribute('data-tone',to);}catch(e){}})();`,
      }}
    />
  );
}
