import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
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
  plugins: [],
};

export default config;
