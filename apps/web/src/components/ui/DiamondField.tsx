import { useId, type JSX } from 'react';

export type Runners = { first: boolean; second: boolean; third: boolean };
export type PulseBases = { first?: boolean; second?: boolean; third?: boolean };
export type FieldVariant = 'utilitarian' | 'editorial' | 'energetic';

interface DiamondFieldProps {
  runners?: Runners;
  pulseBases?: PulseBases;
  size?: number;
  variant?: FieldVariant;
}

export function DiamondField({
  runners = { first: false, second: false, third: false },
  pulseBases,
  size = 220,
  variant = 'editorial',
}: DiamondFieldProps): JSX.Element {
  const isEditorial = variant === 'editorial';
  const isEnergetic = variant === 'energetic';
  // Unique IDs per instance — multiple DiamondFields on the same page
  // (dashboard + marketing + appearance preview) otherwise collide on `turfG` etc.
  const reactId = useId();
  const turfId = `diamond-turf-${reactId}`;
  const dirtId = `diamond-dirt-${reactId}`;
  const glowId = `diamond-glow-${reactId}`;

  const bases = [
    { x: 120, y: 200, k: 'home' as const, on: false, pulse: false },
    { x: 195, y: 125, k: 'first' as const, on: runners.first, pulse: !!pulseBases?.first },
    { x: 120, y: 50,  k: 'second' as const, on: runners.second, pulse: !!pulseBases?.second },
    { x: 45,  y: 125, k: 'third' as const, on: runners.third, pulse: !!pulseBases?.third },
  ];

  return (
    <svg viewBox="0 0 240 220" width={size} height={size} style={{ display: 'block' }} role="img" aria-label="Baseball diamond field">
      <defs>
        <radialGradient id={turfId} cx="50%" cy="60%" r="70%">
          <stop offset="0%" stopColor="var(--turf-500)" stopOpacity="0.9" />
          <stop offset="60%" stopColor="var(--turf-700)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--turf-900)" />
        </radialGradient>
        <linearGradient id={dirtId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c97c4a" />
          <stop offset="100%" stopColor="#8a4a1f" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <path d="M20 180 Q120 -30 220 180 Z" fill={isEditorial ? `url(#${turfId})` : 'var(--turf-700)'} />
      <polygon points="120,50 195,125 120,200 45,125" fill={isEditorial ? `url(#${dirtId})` : 'var(--clay-500)'} />
      <polygon points="120,78 170,125 120,172 70,125" fill={isEditorial ? `url(#${turfId})` : 'var(--turf-600)'} />

      <polygon
        points="120,50 195,125 120,200 45,125"
        fill="none"
        stroke="rgba(255,255,255,.35)"
        strokeWidth="1.2"
        strokeDasharray="2 3"
      />

      {bases.map((b) => (
        <g key={b.k} transform={`translate(${b.x} ${b.y}) rotate(45)`}>
          {b.pulse && (
            <rect
              className="diamond-base-pulse"
              x="-18"
              y="-18"
              width="36"
              height="36"
              fill="var(--brand-500)"
              rx="3"
              filter={`url(#${glowId})`}
            />
          )}
          {b.on && isEnergetic && (
            <rect x="-16" y="-16" width="32" height="32" fill="var(--brand-500)" opacity=".4" filter={`url(#${glowId})`} />
          )}
          <rect
            x={b.k === 'home' ? -10 : -12}
            y={b.k === 'home' ? -10 : -12}
            width={b.k === 'home' ? 20 : 24}
            height={b.k === 'home' ? 20 : 24}
            fill={b.on ? 'var(--brand-500)' : 'white'}
            stroke={b.on ? 'var(--brand-700)' : 'rgba(255,255,255,.8)'}
            strokeWidth="2"
            rx="2"
          />
        </g>
      ))}

      <circle
        cx="120"
        cy="125"
        r="10"
        fill={isEditorial ? `url(#${dirtId})` : 'var(--clay-500)'}
        stroke="rgba(255,255,255,.5)"
        strokeWidth="1"
      />
    </svg>
  );
}
