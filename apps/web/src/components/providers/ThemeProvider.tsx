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

const THEMES    = ['light', 'dark', 'dugout'] as const;
const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
const MOTIONS   = ['on', 'off'] as const;
const TONES     = ['utilitarian', 'editorial', 'energetic'] as const;

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

  const theme   = pick(safeRead(STORAGE_KEYS.theme),   THEMES,    serverPrefs?.theme   ?? DEFAULT_PREFS.theme);
  const density = pick(safeRead(STORAGE_KEYS.density), DENSITIES, serverPrefs?.density ?? DEFAULT_PREFS.density);
  const storedMotion = safeRead(STORAGE_KEYS.motion);
  const motionDefault: Motion = serverPrefs?.motion ?? (reducedMotion ? 'off' : DEFAULT_PREFS.motion);
  const motion = pick(storedMotion, MOTIONS, motionDefault);
  const tone    = pick(safeRead(STORAGE_KEYS.tone),    TONES,     serverPrefs?.tone    ?? DEFAULT_PREFS.tone);

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

// Pre-paint inline script. Reads localStorage, validates against known values,
// falls back to system defaults on any failure. Mirrors readInitialPrefs so the
// server-rendered <html data-*> never desyncs from the hydrated state.
export function AppearanceBootstrap(): JSX.Element {
  const script = `(function(){try{
    var d=document.documentElement;
    var themes=['light','dark','dugout'];
    var densities=['compact','comfortable','spacious'];
    var motions=['on','off'];
    var tones=['utilitarian','editorial','energetic'];
    function pick(k,allow,fb){try{var v=localStorage.getItem(k);return v&&allow.indexOf(v)>-1?v:fb;}catch(e){return fb;}}
    var reduced=false;try{reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
    var t=pick('dos_theme',themes,'light');
    var den=pick('dos_density',densities,'comfortable');
    var m=pick('dos_motion',motions,reduced?'off':'on');
    var to=pick('dos_tone',tones,'editorial');
    d.setAttribute('data-theme',t);
    d.setAttribute('data-density',den);
    d.setAttribute('data-motion',m);
    d.setAttribute('data-tone',to);
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
