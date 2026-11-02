import { BASE_COLORS } from '@baseball/shared';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const twColors = require('tailwindcss/colors') as Record<string, Record<string, string>>;

const TAILWIND_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'emerald',
  'blue',
  'purple',
] as const;

// Literals that apps/web/tailwind.config.ts shipped before theming. Light must
// stay pixel-identical, so the palette data must keep matching them.
const LEGACY = {
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
    50: '#f0fdf4',
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
    50: '#fdf4ed',
    200: '#f4d7b4',
    400: '#d58b4a',
    500: '#c2703a',
    600: '#a1552a',
    700: '#7a3f1f',
  },
} as const;

describe('palette Light parity', () => {
  describe.each(TAILWIND_COLORS)('%s matches tailwindcss/colors', (color) => {
    const base = BASE_COLORS[color] as Record<string, string>;
    const expected = twColors[color];
    it.each(Object.keys(expected))('shade %s', (shade) => {
      expect(base[shade].toLowerCase()).toBe(expected[shade].toLowerCase());
    });
  });

  describe.each(Object.keys(LEGACY) as (keyof typeof LEGACY)[])(
    '%s matches the legacy literals',
    (color) => {
      const base = BASE_COLORS[color] as Record<string, string>;
      const expected = LEGACY[color] as Record<string, string>;
      it.each(Object.keys(expected))('shade %s', (shade) => {
        expect(base[shade].toLowerCase()).toBe(expected[shade].toLowerCase());
      });
    },
  );
});
