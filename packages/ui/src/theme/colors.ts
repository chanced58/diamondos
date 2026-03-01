export const colors = {
  // Brand — baseball dirt / navy palette
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#1d4ed8',  // royal blue
    600: '#1e40af',
    700: '#1e3a8a',
    900: '#1e2d6b',
  },
  // Pitch count severity
  safe: '#16a34a',      // green — under 75%
  warning: '#ca8a04',   // amber — 75-89%
  danger: '#dc2626',    // red — 90%+

  // Neutral
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    400: '#9ca3af',
    600: '#4b5563',
    800: '#1f2937',
    900: '#111827',
  },

  // Semantic
  surface: '#ffffff',
  background: '#f9fafb',
  border: '#e5e7eb',
  text: {
    primary: '#111827',
    secondary: '#6b7280',
    inverse: '#ffffff',
  },
} as const;
