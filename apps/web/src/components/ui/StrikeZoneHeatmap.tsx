import type { JSX } from 'react';

export type PitchCall = 'ball' | 'strike' | 'calledK' | 'swingK' | 'foul' | 'inPlay';

export interface PitchPoint {
  x: number; // 0..1
  y: number; // 0..1
  call: PitchCall;
  num: number;
}

const CALL_COLOR: Record<PitchCall, string> = {
  ball:    'var(--count-balls)',
  strike:  'var(--count-strikes)',
  calledK: 'var(--count-strikes)',
  swingK:  '#f59e0b',
  foul:    'var(--clay-500)',
  inPlay:  'var(--brand-500)',
};

interface StrikeZoneHeatmapProps {
  pitches: PitchPoint[];
  width?: number;
  height?: number;
}

export function StrikeZoneHeatmap({
  pitches,
  width = 200,
  height = 260,
}: StrikeZoneHeatmapProps): JSX.Element {
  // Zone occupies the middle third vertically/horizontally of the SVG.
  const zoneX = width * 0.2;
  const zoneY = height * 0.18;
  const zoneW = width * 0.6;
  const zoneH = height * 0.55;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      {/* Plate silhouette */}
      <path
        d={`M ${width * 0.22} ${height - 20} L ${width * 0.78} ${height - 20} L ${width * 0.7} ${height - 8} L ${width * 0.5} ${height - 2} L ${width * 0.3} ${height - 8} Z`}
        fill="var(--app-surface-2)"
        stroke="var(--app-border-strong)"
        strokeWidth="1"
      />
      {/* Strike zone box */}
      <rect
        x={zoneX}
        y={zoneY}
        width={zoneW}
        height={zoneH}
        fill="var(--app-surface-2)"
        stroke="var(--app-border-strong)"
        strokeWidth="2"
        rx="2"
      />
      {/* Inner grid (dashed 3x3) */}
      {[1, 2].map((i) => (
        <line
          key={`v${i}`}
          x1={zoneX + (zoneW / 3) * i}
          y1={zoneY}
          x2={zoneX + (zoneW / 3) * i}
          y2={zoneY + zoneH}
          stroke="var(--app-border)"
          strokeDasharray="3 3"
        />
      ))}
      {[1, 2].map((i) => (
        <line
          key={`h${i}`}
          x1={zoneX}
          y1={zoneY + (zoneH / 3) * i}
          x2={zoneX + zoneW}
          y2={zoneY + (zoneH / 3) * i}
          stroke="var(--app-border)"
          strokeDasharray="3 3"
        />
      ))}
      {/* Pitch markers */}
      {pitches.map((p) => {
        const cx = zoneX + p.x * zoneW;
        const cy = zoneY + p.y * zoneH;
        return (
          <g key={p.num}>
            <circle cx={cx} cy={cy} r="11" fill={CALL_COLOR[p.call] ?? 'var(--app-fg-muted)'} opacity="0.85" />
            <text
              x={cx}
              y={cy + 3}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="white"
              fontFamily="var(--font-mono)"
            >
              {p.num}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
