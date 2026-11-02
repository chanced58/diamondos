import type { Config } from 'tailwindcss';
// Relative path on purpose: tailwind.ts is not re-exported from the package
// index, and Tailwind loads this config through jiti, which handles TS.
import {
  themedTailwindColors,
  themeVarsPlugin,
} from '../../packages/shared/src/theme/tailwind';

// brand/turf/clay historically defined only some shades. The shared palette
// carries the full ramp, which would turn previously dead classes such as
// `border-brand-200` or `text-brand-400` into live ones and change Light.
// Prune the role maps back to the shades that existed, so Light is unchanged.
const LEGACY_SHADES = {
  brand: ['50', '100', '500', '600', '700', '800', '900'],
  turf: ['50', '100', '200', '400', '500', '600', '700', '800', '900'],
  clay: ['50', '200', '400', '500', '600', '700'],
} as const;

function pruneLegacyScales<T extends Record<string, unknown>>(map: T): T {
  const out: Record<string, unknown> = { ...map };
  for (const [hue, shades] of Object.entries(LEGACY_SHADES)) {
    const full = map[hue] as Record<string, string>;
    out[hue] = Object.fromEntries(shades.map((shade) => [shade, full[shade]]));
  }
  return out as T;
}

const rawThemed = themedTailwindColors();
const themed = Object.fromEntries(
  Object.entries(rawThemed).map(([utility, map]) => [utility, pruneLegacyScales(map)]),
) as typeof rawThemed;
// Tailwind's default border/divide color is gray-200; theme the bare DEFAULT
// key too so Preflight's `border-color` and bare `border` follow the theme.
const DEFAULT_LINE = 'rgb(var(--dos-line-gray-200) / <alpha-value>)';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Role-specific colors resolve through `--dos-*` variables. They override
      // the literal `colors` scales below for the utilities they cover (deep
      // merge of `extend`); the literals keep uncovered utilities working
      // (ring-offset, shadow, accent, caret, decoration).
      ...themed,
      borderColor: { ...themed.borderColor, DEFAULT: DEFAULT_LINE },
      divideColor: { ...themed.divideColor, DEFAULT: DEFAULT_LINE },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#1d4ed8',
          600: '#1e40af',
          700: '#1e3a8a',
          800: '#1e3270',
          900: '#1e2d6b',
        },
        turf: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        clay: {
          50:  '#fdf4ed',
          200: '#f4d7b4',
          400: '#d58b4a',
          500: '#c2703a',
          600: '#a1552a',
          700: '#7a3f1f',
        },
        app: {
          bg:            'var(--app-bg)',
          surface:       'var(--app-surface)',
          'surface-2':   'var(--app-surface-2)',
          'surface-raised': 'var(--app-surface-raised)',
          border:        'var(--app-border)',
          'border-strong':'var(--app-border-strong)',
          fg:            'var(--app-fg)',
          'fg-muted':    'var(--app-fg-muted)',
          'fg-subtle':   'var(--app-fg-subtle)',
          brand:         'var(--app-brand)',
          'brand-2':     'var(--app-brand-2)',
          turf:          'var(--app-turf)',
        },
        pitch: {
          safe:    'var(--safe)',
          warning: 'var(--warning)',
          danger:  'var(--danger)',
        },
      },
      borderRadius: {
        'dos-sm':   'var(--r-sm)',
        'dos-md':   'var(--r-md)',
        'dos-lg':   'var(--r-lg)',
        'dos-xl':   'var(--r-xl)',
        'dos-full': 'var(--r-full)',
      },
      transitionTimingFunction: {
        'dos': 'cubic-bezier(.22,1,.36,1)',
      },
      transitionDuration: {
        'dos': '220ms',
      },
      keyframes: {
        livepulse: {
          '0%':   { boxShadow: '0 0 0 0 rgba(239,68,68,.6)' },
          '70%':  { boxShadow: '0 0 0 10px rgba(239,68,68,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0)' },
        },
        ping: {
          '0%':   { transform: 'scale(1)' },
          '40%':  { transform: 'scale(1.55)' },
          '100%': { transform: 'scale(1)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        livepulse: 'livepulse 1.6s infinite',
        ping:      'ping 450ms cubic-bezier(.22,1,.36,1)',
        fadeUp:    'fadeUp 320ms cubic-bezier(.22,1,.36,1)',
      },
    },
  },
  plugins: [themeVarsPlugin({ themeSelectors: true })],
};

export default config;
