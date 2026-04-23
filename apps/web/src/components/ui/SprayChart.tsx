import type { JSX } from 'react';

export type SprayZone = 'lf' | 'cf' | 'rf' | 'if';

export interface HitPoint {
  x: number; // 0..1 horizontal (0 = 3B line, 1 = 1B line)
  y: number; // 0..1 vertical   (0 = outfield wall, 1 = home plate)
  zone: SprayZone;
}

const ZONE_COLOR: Record<SprayZone, string> = {
  lf: 'var(--turf-600)',
  cf: 'var(--brand-500)',
  rf: 'var(--clay-500)',
  if: 'var(--gray-400)',
};

interface SprayChartProps {
  hits: HitPoint[];
  width?: number;
  height?: number;
}

export function SprayChart({ hits, width = 340, height = 260 }: SprayChartProps): JSX.Element {
  // Home plate sits at (width/2, height - 12). Outfield wall is the top arc.
  const plateX = width / 2;
  const plateY = height - 12;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="sprayTurf" cx="50%" cy="100%" r="100%">
          <stop offset="0%" stopColor="var(--turf-500)" stopOpacity="0.6" />
          <stop offset="70%" stopColor="var(--turf-700)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--turf-900)" />
        </radialGradient>
        <linearGradient id="sprayDirt" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="#c97c4a" />
          <stop offset="100%" stopColor="#8a4a1f" />
        </linearGradient>
      </defs>

      {/* Outfield wedge */}
      <path
        d={`M ${plateX} ${plateY} L 20 40 Q ${plateX} -40 ${width - 20} 40 Z`}
        fill="url(#sprayTurf)"
      />
      {/* Infield wedge (clay) */}
      <path
        d={`M ${plateX} ${plateY} L ${plateX - 90} ${plateY - 90} Q ${plateX} ${plateY - 130} ${plateX + 90} ${plateY - 90} Z`}
        fill="url(#sprayDirt)"
      />
      {/* Basepath chalk */}
      <path
        d={`M ${plateX} ${plateY} L ${plateX - 90} ${plateY - 90} Q ${plateX} ${plateY - 130} ${plateX + 90} ${plateY - 90} Z`}
        fill="none"
        stroke="rgba(255,255,255,.5)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      {/* Home plate pentagon */}
      <path
        d={`M ${plateX - 8} ${plateY} L ${plateX + 8} ${plateY} L ${plateX + 6} ${plateY + 6} L ${plateX} ${plateY + 10} L ${plateX - 6} ${plateY + 6} Z`}
        fill="white"
        stroke="rgba(0,0,0,.3)"
      />

      {/* Hit markers */}
      {hits.map((h, i) => {
        const cx = 20 + h.x * (width - 40);
        const cy = 20 + h.y * (plateY - 20);
        return (
          <circle
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            cx={cx}
            cy={cy}
            r="4"
            fill={ZONE_COLOR[h.zone]}
            opacity="0.9"
            stroke="white"
            strokeWidth="0.8"
          />
        );
      })}
    </svg>
  );
}
