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
  plugins: [],
};
