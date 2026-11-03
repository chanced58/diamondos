/**
 * Text on the live scoring screen (score.tsx and src/features/scoring/) runs
 * this much larger than the rest of the app — it is read at arm's length,
 * mid-play. Every scoring text size is a `text-score-*` class built from it,
 * so the whole screen scales from this one number.
 */
const SCORING_TEXT_SCALE = 1.05;

// NativeWind's native rem is 14px, so px sizes convert at 1/14 rem.
const scoringSize = (sizeRem, lineHeightRem) => [
  `${sizeRem * SCORING_TEXT_SCALE}rem`,
  { lineHeight: `${lineHeightRem * SCORING_TEXT_SCALE}rem` },
];
const scoringPx = (px) => [`${(px / 14) * SCORING_TEXT_SCALE}rem`, {}];

// Relative path on purpose: theme/tailwind.ts is not re-exported from the
// package index. Tailwind (and NativeWind's Metro transformer, which loads this
// config through Tailwind) resolves the TS module with jiti; jest-expo's babel
// transform handles it in tests.
/* eslint-disable @typescript-eslint/no-var-requires */
const {
  themedTailwindColors,
  semanticTailwindColors,
  themeVarsPlugin,
} = require('../../packages/shared/src/theme/tailwind');
/* eslint-enable @typescript-eslint/no-var-requires */

// Before theming, mobile defined only these `brand` shades and no `turf` or
// `clay` at all. The shared palette carries the full ramps, which would turn
// previously dead classes (`bg-brand-200`, `text-turf-600`, ...) into live ones
// and change Light. Prune every themed role map back to the legacy sets so
// Light is pixel-identical; the dead classes stay dead.
const LEGACY_BRAND_SHADES = ['50', '100', '500', '600', '700', '900'];

function pruneLegacyScales(map) {
  const rest = { ...map };
  delete rest.turf;
  delete rest.clay;
  return {
    ...rest,
    brand: Object.fromEntries(LEGACY_BRAND_SHADES.map((shade) => [shade, map.brand[shade]])),
  };
}

const rawThemed = themedTailwindColors();
const themed = Object.fromEntries(
  Object.entries(rawThemed).map(([utility, map]) => [utility, pruneLegacyScales(map)]),
);
// Tailwind's default border/divide color is gray-200; theme the bare DEFAULT
// key too so a bare `border` / `divide-x` follows the theme.
const DEFAULT_LINE = 'rgb(var(--dos-line-gray-200) / <alpha-value>)';

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Role-specific colors resolve through `--dos-*` variables. They override
      // the literal `colors` scale below for the utilities they cover.
      ...themed,
      borderColor: { ...themed.borderColor, DEFAULT: DEFAULT_LINE },
      divideColor: { ...themed.divideColor, DEFAULT: DEFAULT_LINE },
      // Tailwind's default size/line-height pairs, scaled. See SCORING_TEXT_SCALE.
      fontSize: {
        'score-xs': scoringSize(0.75, 1),
        'score-sm': scoringSize(0.875, 1.25),
        'score-base': scoringSize(1, 1.5),
        'score-lg': scoringSize(1.125, 1.75),
        'score-xl': scoringSize(1.25, 1.75),
        'score-2xl': scoringSize(1.5, 2),
        'score-10px': scoringPx(10),
        'score-11px': scoringPx(11),
        'score-12px': scoringPx(12),
        'score-13px': scoringPx(13),
        'score-15px': scoringPx(15),
      },
      colors: {
        ...semanticTailwindColors(),
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#1d4ed8',
          600: '#1e40af',
          700: '#1e3a8a',
          900: '#1e2d6b',
        },
      },
    },
  },
  // Light is the `:root` default; Dark/Dugout come from NativeWind `vars()` at runtime.
  plugins: [themeVarsPlugin({ themeSelectors: false })],
};
