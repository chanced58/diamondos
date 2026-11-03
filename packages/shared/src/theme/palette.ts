/**
 * Theme palette data: light base scales, dark/dugout neutral ramps, and
 * semantic tokens. Hex only; no dependency on Tailwind.
 */

export type ResolvedTheme = 'light' | 'dark' | 'dugout';
export const RESOLVED_THEMES: readonly ResolvedTheme[] = ['light', 'dark', 'dugout'];

export const SHADES = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
] as const;
export type Shade = (typeof SHADES)[number];

export const THEMED_HUES = [
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'emerald',
  'blue',
  'purple',
  'brand',
  'turf',
  'clay',
] as const;
export type ThemedHue = (typeof THEMED_HUES)[number];

export type PaletteColor = 'gray' | ThemedHue;

/** Light base scales. gray and the eight Tailwind hues are Tailwind 3.4 defaults verbatim. */
export const BASE_COLORS: Record<PaletteColor, Record<Shade, string>> = {
  gray: {
    '50': '#f9fafb',
    '100': '#f3f4f6',
    '200': '#e5e7eb',
    '300': '#d1d5db',
    '400': '#9ca3af',
    '500': '#6b7280',
    '600': '#4b5563',
    '700': '#374151',
    '800': '#1f2937',
    '900': '#111827',
    '950': '#030712',
  },
  red: {
    '50': '#fef2f2',
    '100': '#fee2e2',
    '200': '#fecaca',
    '300': '#fca5a5',
    '400': '#f87171',
    '500': '#ef4444',
    '600': '#dc2626',
    '700': '#b91c1c',
    '800': '#991b1b',
    '900': '#7f1d1d',
    '950': '#450a0a',
  },
  orange: {
    '50': '#fff7ed',
    '100': '#ffedd5',
    '200': '#fed7aa',
    '300': '#fdba74',
    '400': '#fb923c',
    '500': '#f97316',
    '600': '#ea580c',
    '700': '#c2410c',
    '800': '#9a3412',
    '900': '#7c2d12',
    '950': '#431407',
  },
  amber: {
    '50': '#fffbeb',
    '100': '#fef3c7',
    '200': '#fde68a',
    '300': '#fcd34d',
    '400': '#fbbf24',
    '500': '#f59e0b',
    '600': '#d97706',
    '700': '#b45309',
    '800': '#92400e',
    '900': '#78350f',
    '950': '#451a03',
  },
  yellow: {
    '50': '#fefce8',
    '100': '#fef9c3',
    '200': '#fef08a',
    '300': '#fde047',
    '400': '#facc15',
    '500': '#eab308',
    '600': '#ca8a04',
    '700': '#a16207',
    '800': '#854d0e',
    '900': '#713f12',
    '950': '#422006',
  },
  green: {
    '50': '#f0fdf4',
    '100': '#dcfce7',
    '200': '#bbf7d0',
    '300': '#86efac',
    '400': '#4ade80',
    '500': '#22c55e',
    '600': '#16a34a',
    '700': '#15803d',
    '800': '#166534',
    '900': '#14532d',
    '950': '#052e16',
  },
  emerald: {
    '50': '#ecfdf5',
    '100': '#d1fae5',
    '200': '#a7f3d0',
    '300': '#6ee7b7',
    '400': '#34d399',
    '500': '#10b981',
    '600': '#059669',
    '700': '#047857',
    '800': '#065f46',
    '900': '#064e3b',
    '950': '#022c22',
  },
  blue: {
    '50': '#eff6ff',
    '100': '#dbeafe',
    '200': '#bfdbfe',
    '300': '#93c5fd',
    '400': '#60a5fa',
    '500': '#3b82f6',
    '600': '#2563eb',
    '700': '#1d4ed8',
    '800': '#1e40af',
    '900': '#1e3a8a',
    '950': '#172554',
  },
  purple: {
    '50': '#faf5ff',
    '100': '#f3e8ff',
    '200': '#e9d5ff',
    '300': '#d8b4fe',
    '400': '#c084fc',
    '500': '#a855f7',
    '600': '#9333ea',
    '700': '#7e22ce',
    '800': '#6b21a8',
    '900': '#581c87',
    '950': '#3b0764',
  },
  brand: {
    '50': '#eff6ff',
    '100': '#dbeafe',
    '200': '#bfdbfe',
    '300': '#93c5fd',
    '400': '#60a5fa',
    '500': '#1d4ed8',
    '600': '#1e40af',
    '700': '#1e3a8a',
    '800': '#1e3270',
    '900': '#1e2d6b',
    '950': '#172554',
  },
  turf: {
    '50': '#f0fdf4',
    '100': '#dcfce7',
    '200': '#bbf7d0',
    '300': '#86efac',
    '400': '#4ade80',
    '500': '#22c55e',
    '600': '#16a34a',
    '700': '#15803d',
    '800': '#166534',
    '900': '#14532d',
    '950': '#052e16',
  },
  clay: {
    '50': '#fdf4ed',
    '100': '#fae8d8',
    '200': '#f4d7b4',
    '300': '#e8b07e',
    '400': '#d58b4a',
    '500': '#c2703a',
    '600': '#a1552a',
    '700': '#7a3f1f',
    '800': '#5c2f17',
    '900': '#3f2010',
    '950': '#2a150a',
  },
};

/**
 * Dark/dugout neutral ramps. Light-text shades (fg 50-200) and dark-fill
 * shades (bg 600-950) intentionally stay dark-mode-compatible so existing
 * "light text on dark chip" pairs keep working.
 */
export const NEUTRAL_RAMPS: Record<
  'dark' | 'dugout',
  {
    bg: Record<'white' | Shade, string>;
    fg: Record<Shade, string>;
    line: Record<Shade, string>;
    black: string;
  }
> = {
  dark: {
    bg: {
      white: '#181b22',
      '50': '#14171d',
      '100': '#1e222b',
      '200': '#2a2f3a',
      '300': '#3a404d',
      '400': '#4b5260',
      '500': '#6b7280',
      '600': '#4b5260',
      '700': '#3a404d',
      '800': '#2a2f3a',
      '900': '#0a0c10',
      '950': '#050608',
    },
    fg: {
      '50': '#f9fafb',
      '100': '#f3f4f6',
      '200': '#e5e7eb',
      '300': '#5b6270',
      '400': '#7c8392',
      '500': '#9ba1ad',
      '600': '#a7adb8',
      '700': '#c9cdd5',
      '800': '#dcdfe5',
      '900': '#e7e9ee',
      '950': '#f3f4f6',
    },
    line: {
      '50': '#1e222b',
      '100': '#23272f',
      '200': '#2a2f3a',
      '300': '#646b7a',
      '400': '#7c8392',
      '500': '#6b7280',
      '600': '#7c8392',
      '700': '#9ba1ad',
      '800': '#c9cdd5',
      '900': '#e7e9ee',
      '950': '#f3f4f6',
    },
    black: '#e7e9ee',
  },
  dugout: {
    bg: {
      white: '#0d1a10',
      '50': '#0a160c',
      '100': '#122418',
      '200': '#1a3320',
      '300': '#25482d',
      '400': '#355a3c',
      '500': '#4f6a4f',
      '600': '#355a3c',
      '700': '#25482d',
      '800': '#1a3320',
      '900': '#050c06',
      '950': '#030703',
    },
    fg: {
      '50': '#f9fafb',
      '100': '#f3f4f6',
      '200': '#e5e7eb',
      '300': '#56684f',
      '400': '#7d9076',
      '500': '#9fb298',
      '600': '#b3c4ad',
      '700': '#d2dece',
      '800': '#e4ece0',
      '900': '#f2f7ee',
      '950': '#f7faf5',
    },
    line: {
      '50': '#122418',
      '100': '#16291b',
      '200': '#1a3320',
      '300': '#557055',
      '400': '#6b7f65',
      '500': '#7d9076',
      '600': '#9fb298',
      '700': '#b3c4ad',
      '800': '#d2dece',
      '900': '#f2f7ee',
      '950': '#f7faf5',
    },
    black: '#f2f7ee',
  },
};

export const THEME_SURFACE: Record<'dark' | 'dugout', string> = {
  dark: '#181b22',
  dugout: '#0d1a10',
};

export type SemanticToken =
  | 'bg'
  | 'surface'
  | 'surface-2'
  | 'surface-raised'
  | 'border'
  | 'border-strong'
  | 'fg'
  | 'fg-muted'
  | 'fg-subtle'
  | 'sidebar-bg'
  | 'sidebar-fg'
  | 'sidebar-active'
  | 'brand'
  | 'brand-2'
  | 'turf';

/** Light = today's `:root` --app-* values; dugout = existing globals.css block. */
export const SEMANTIC_TOKENS: Record<ResolvedTheme, Record<SemanticToken, string>> = {
  light: {
    bg: '#f9fafb',
    surface: '#ffffff',
    'surface-2': '#f9fafb',
    'surface-raised': '#ffffff',
    border: '#e5e7eb',
    'border-strong': '#d1d5db',
    fg: '#111827',
    'fg-muted': '#6b7280',
    'fg-subtle': '#9ca3af',
    'sidebar-bg': '#1e2d6b',
    'sidebar-fg': '#ffffff',
    'sidebar-active': '#1e3a8a',
    brand: '#1e3a8a',
    'brand-2': '#1d4ed8',
    turf: '#16a34a',
  },
  dark: {
    bg: '#0f1115',
    surface: '#181b22',
    'surface-2': '#14171d',
    'surface-raised': '#1e222b',
    border: '#2a2f3a',
    'border-strong': '#3a404d',
    fg: '#e7e9ee',
    'fg-muted': '#9ba1ad',
    'fg-subtle': '#6b7280',
    'sidebar-bg': '#0a0c10',
    'sidebar-fg': '#e7e9ee',
    'sidebar-active': '#232833',
    brand: '#2563eb',
    'brand-2': '#60a5fa',
    turf: '#16a34a',
  },
  dugout: {
    bg: '#08120a',
    surface: '#0d1a10',
    'surface-2': '#0a160c',
    'surface-raised': '#122418',
    border: '#1a3320',
    'border-strong': '#25482d',
    fg: '#f2f7ee',
    'fg-muted': '#9fb298',
    'fg-subtle': '#6b7f65',
    'sidebar-bg': '#071008',
    'sidebar-fg': '#f2f7ee',
    'sidebar-active': '#143c1e',
    brand: '#22c55e',
    'brand-2': '#4ade80',
    turf: '#16a34a',
  },
};
