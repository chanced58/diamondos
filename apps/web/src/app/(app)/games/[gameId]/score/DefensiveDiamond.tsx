import { useId, type JSX } from 'react';
import type { DefensiveLineup, Fielder, PositionAbbr } from '@baseball/shared';

interface DefensiveDiamondProps {
  lineup: DefensiveLineup;
  /** Label shown above the diamond (e.g., "Our Team" or "Opponent"). */
  teamLabel?: string;
  size?: number;
}

type Spot = {
  pos: Exclude<PositionAbbr, 'DH'>;
  /** Center coords on the 320×260 SVG canvas. */
  cx: number;
  cy: number;
};

const SPOTS: Spot[] = [
  { pos: 'CF', cx: 160, cy: 40 },
  { pos: 'LF', cx: 50, cy: 75 },
  { pos: 'RF', cx: 270, cy: 75 },
  { pos: 'SS', cx: 115, cy: 130 },
  { pos: '2B', cx: 205, cy: 130 },
  { pos: '3B', cx: 70, cy: 175 },
  { pos: '1B', cx: 250, cy: 175 },
  { pos: 'P', cx: 160, cy: 165 },
  { pos: 'C', cx: 160, cy: 240 },
];

function fielderLabel(f: Fielder | null): string {
  if (!f) return '';
  const num = f.jerseyNumber != null && f.jerseyNumber !== '' ? `#${f.jerseyNumber} ` : '';
  return `${num}${f.lastName}`.trim();
}

export function DefensiveDiamond({
  lineup,
  teamLabel,
  size = 320,
}: DefensiveDiamondProps): JSX.Element {
  const reactId = useId();
  const turfId = `def-turf-${reactId}`;
  const dirtId = `def-dirt-${reactId}`;

  const aspect = 260 / 320;
  const height = Math.round(size * aspect);

  return (
    <div className="space-y-2">
      {teamLabel && (
        <p className="text-xs text-gray-400 uppercase tracking-wide">
          {teamLabel} — current alignment
        </p>
      )}
      <svg
        viewBox="0 0 320 260"
        width={size}
        height={height}
        style={{ display: 'block', maxWidth: '100%' }}
        role="img"
        aria-label="Current defensive alignment"
      >
        <defs>
          <radialGradient id={turfId} cx="50%" cy="65%" r="75%">
            <stop offset="0%" stopColor="var(--turf-500)" stopOpacity="0.85" />
            <stop offset="60%" stopColor="var(--turf-700)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--turf-900)" />
          </radialGradient>
          <linearGradient id={dirtId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c97c4a" />
            <stop offset="100%" stopColor="#8a4a1f" />
          </linearGradient>
        </defs>

        {/* Outfield arc */}
        <path d="M10 220 Q160 -40 310 220 Z" fill={`url(#${turfId})`} />
        {/* Infield dirt */}
        <polygon points="160,90 240,170 160,250 80,170" fill={`url(#${dirtId})`} />
        {/* Infield grass */}
        <polygon points="160,115 215,170 160,225 105,170" fill={`url(#${turfId})`} />
        {/* Foul lines */}
        <line x1="160" y1="240" x2="20" y2="100" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
        <line x1="160" y1="240" x2="300" y2="100" stroke="rgba(255,255,255,.35)" strokeWidth="1" />

        {/* Bases */}
        {[
          { x: 160, y: 240 }, // home
          { x: 240, y: 170 }, // 1B
          { x: 160, y: 90 },  // 2B
          { x: 80, y: 170 },  // 3B
        ].map((b, i) => (
          <g key={i} transform={`translate(${b.x} ${b.y}) rotate(45)`}>
            <rect x="-7" y="-7" width="14" height="14" fill="white" stroke="rgba(255,255,255,.7)" strokeWidth="1" rx="1.5" />
          </g>
        ))}
        {/* Pitcher's mound */}
        <circle cx="160" cy="165" r="9" fill={`url(#${dirtId})`} stroke="rgba(255,255,255,.4)" strokeWidth="1" />

        {/* Fielder badges */}
        {SPOTS.map((spot) => {
          const f = lineup[spot.pos];
          const label = fielderLabel(f);
          const display = f ? `${spot.pos}  ${label}` : spot.pos;
          const text = display.length > 14 ? display.slice(0, 13) + '…' : display;
          // Approximate width for the rect background.
          const width = Math.max(36, text.length * 6.4 + 10);
          return (
            <g key={spot.pos} transform={`translate(${spot.cx} ${spot.cy})`}>
              <rect
                x={-width / 2}
                y={-10}
                width={width}
                height={20}
                rx={6}
                fill={f ? 'var(--brand-700)' : 'rgba(0,0,0,.45)'}
                stroke={f ? 'var(--brand-500)' : 'rgba(255,255,255,.35)'}
                strokeWidth={1}
              />
              <text
                x={0}
                y={4}
                textAnchor="middle"
                fontSize="11"
                fontWeight={600}
                fill="white"
                style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
              >
                {text}
              </text>
            </g>
          );
        })}
      </svg>

      {/* DH row */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400 uppercase tracking-wide w-8">DH</span>
        {lineup.DH ? (
          <span className="text-gray-700 font-medium">{fielderLabel(lineup.DH)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </div>
    </div>
  );
}
