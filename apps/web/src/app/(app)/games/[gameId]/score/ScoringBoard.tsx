'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { deriveGameState } from '@baseball/shared';
import type { GameEvent } from '@baseball/shared';
import { endGameAction } from '../actions';

// ── Types ─────────────────────────────────────────────────────────────────────

type GameRow = {
  id: string;
  opponentName: string;
  locationType: string;
  teamId: string;
};

type LineupEntry = {
  playerId: string;
  battingOrder: number;
  startingPosition: string | null;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    jerseyNumber: number | null;
  };
};

// Raw DB row shape — has snake_case columns
type EventRow = Record<string, unknown>;

function mapRowToEvent(row: EventRow): GameEvent {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    sequenceNumber: row.sequence_number as number,
    eventType: row.event_type as GameEvent['eventType'],
    inning: row.inning as number,
    isTopOfInning: row.is_top_of_inning as boolean,
    payload: (row.payload ?? {}) as GameEvent['payload'],
    occurredAt: row.occurred_at as string,
    createdBy: row.created_by as string,
    deviceId: (row.device_id as string) ?? 'web',
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Dot({ filled, color }: { filled: boolean; color: string }) {
  return (
    <span
      className={`inline-block w-4 h-4 rounded-full border-2 ${
        filled ? color : 'border-gray-300 bg-transparent'
      }`}
    />
  );
}

function BaserunnerDiamond({ runners }: { runners: { first: string | null; second: string | null; third: string | null } }) {
  return (
    <div className="relative w-20 h-20 mx-auto">
      {/* Diamond shape using positioned squares rotated 45deg */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-12 h-12">
          {/* Second base — top */}
          <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rotate-45 border-2 ${runners.second ? 'bg-brand-500 border-brand-600' : 'bg-white border-gray-400'}`} />
          {/* First base — right */}
          <div className={`absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-5 h-5 rotate-45 border-2 ${runners.first ? 'bg-brand-500 border-brand-600' : 'bg-white border-gray-400'}`} />
          {/* Third base — left */}
          <div className={`absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rotate-45 border-2 ${runners.third ? 'bg-brand-500 border-brand-600' : 'bg-white border-gray-400'}`} />
          {/* Home plate — bottom */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-5 h-5 rotate-45 border-2 bg-gray-200 border-gray-400" />
        </div>
      </div>
    </div>
  );
}

const PITCH_TYPE_OPTIONS = [
  { label: 'FB',  value: 'fastball' },
  { label: 'CB',  value: 'curveball' },
  { label: 'SL',  value: 'slider' },
  { label: 'CH',  value: 'changeup' },
  { label: 'SI',  value: 'sinker' },
  { label: 'CT',  value: 'cutter' },
  { label: 'KN',  value: 'knuckleball' },
  { label: 'Other', value: 'other' },
];

function PitchTypeSelector({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (type: string | null) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Pitch type
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PITCH_TYPE_OPTIONS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => onSelect(selected === value ? null : value)}
            className={`px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
              selected === value
                ? 'bg-brand-600 text-white border-brand-700'
                : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400 hover:text-brand-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Strike zone: 5×5 grid (pitcher's view)
// Inner 3×3 (zones 1-9) = strike zone; outer ring (zones 10-25) = ball/miss locations
// Layout:
//   10 | 11 | 12 | 13 | 14   ← above zone
//   15 |  1 |  2 |  3 | 16   ← top of zone
//   17 |  4 |  5 |  6 | 18   ← middle
//   19 |  7 |  8 |  9 | 20   ← bottom of zone
//   21 | 22 | 23 | 24 | 25   ← below zone
const ZONE_MAP = [
  [10, 11, 12, 13, 14],
  [15,  1,  2,  3, 16],
  [17,  4,  5,  6, 18],
  [19,  7,  8,  9, 20],
  [21, 22, 23, 24, 25],
] as const;
const INNER_ZONES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

function StrikeZoneGrid({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (zone: number | null) => void;
}) {
  const toggle = (zone: number) => onSelect(selected === zone ? null : zone);
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Location
      </p>
      <div className="grid grid-cols-5 gap-px bg-gray-300 border border-gray-300 rounded overflow-hidden w-fit">
        {ZONE_MAP.flat().map((zone) => {
          const isInner = INNER_ZONES.has(zone);
          const isSelected = selected === zone;
          return (
            <button
              key={zone}
              onClick={() => toggle(zone)}
              className={`w-8 h-8 text-xs font-bold transition-colors ${
                isSelected
                  ? isInner
                    ? 'bg-brand-500 text-white'
                    : 'bg-amber-400 text-white'
                  : isInner
                    ? 'bg-white text-gray-400 hover:bg-brand-50 hover:text-brand-600'
                    : 'bg-gray-100 text-gray-300 hover:bg-amber-50'
              }`}
            >
              {isInner ? zone : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Baseball field spray chart — SVG coordinate system:
//   Home plate at (HX=120, HY=185), field radius R=150
//   Normalized output: sprayX 0=left, 0.5=center, 1=right; sprayY 0=HP, 1=deep CF
function SprayChartPicker({
  value,
  onChange,
}: {
  value: { x: number; y: number } | null;
  onChange: (point: { x: number; y: number } | null) => void;
}) {
  const HX = 120, HY = 185, R = 150;

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * 240;
    const svgY = ((e.clientY - rect.top) / rect.height) * 200;
    const x = Math.max(0, Math.min(1, (svgX - HX) / R + 0.5));
    const y = Math.max(0, Math.min(1, (HY - svgY) / R));
    onChange({ x, y });
  }

  const dotX = value != null ? (value.x - 0.5) * R + HX : null;
  const dotY = value != null ? HY - value.y * R : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Ball location <span className="font-normal normal-case text-gray-300">— tap field</span>
        </p>
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>
      <svg
        viewBox="0 0 240 200"
        className="w-full rounded-lg border border-gray-200 cursor-crosshair"
        onClick={handleClick}
      >
        {/* Sky/background */}
        <rect width="240" height="200" fill="#e0f2fe" />

        {/* Fair territory — light green */}
        <path d="M 120 185 L 14 79 A 150 150 0 0 1 226 79 Z" fill="#86efac" />

        {/* Infield dirt circle */}
        <circle cx="120" cy="132" r="52" fill="#d4a76a" />

        {/* Diamond (grass cutout inside dirt) */}
        <polygon points="120,185 165,140 120,95 75,140" fill="#a3c97c" stroke="none" />

        {/* Diamond outline */}
        <polygon
          points="120,185 165,140 120,95 75,140"
          fill="none"
          stroke="#374151"
          strokeWidth="1.5"
        />

        {/* Outfield wall */}
        <path d="M 14 79 A 150 150 0 0 1 226 79" stroke="#374151" strokeWidth="2.5" fill="none" />

        {/* Foul lines */}
        <line x1="120" y1="185" x2="14" y2="79" stroke="#6b7280" strokeWidth="1" strokeDasharray="5 3" />
        <line x1="120" y1="185" x2="226" y2="79" stroke="#6b7280" strokeWidth="1" strokeDasharray="5 3" />

        {/* Pitcher's mound */}
        <circle cx="120" cy="131" r="7" fill="#c8956c" stroke="#92644e" strokeWidth="1.5" />

        {/* Bases (rotated squares at each corner) */}
        <rect x="159" y="134" width="12" height="12" fill="white" stroke="#374151" strokeWidth="1.5"
          transform="rotate(45, 165, 140)" />
        <rect x="114" y="89" width="12" height="12" fill="white" stroke="#374151" strokeWidth="1.5"
          transform="rotate(45, 120, 95)" />
        <rect x="69" y="134" width="12" height="12" fill="white" stroke="#374151" strokeWidth="1.5"
          transform="rotate(45, 75, 140)" />

        {/* Home plate */}
        <polygon
          points="120,196 130,188 127,178 113,178 110,188"
          fill="white"
          stroke="#374151"
          strokeWidth="1.5"
        />

        {/* Zone boundary arcs — dashed lines dividing infield / short OF / deep OF */}
        {/* Infield/Short-OF boundary at d=65 from home plate */}
        <path d="M 74 139 A 65 65 0 0 1 166 139" stroke="#9ca3af" strokeWidth="1" strokeDasharray="4 3" fill="none" />
        {/* Short-OF/Deep-OF boundary at d=110 from home plate */}
        <path d="M 42 107 A 110 110 0 0 1 198 107" stroke="#9ca3af" strokeWidth="1" strokeDasharray="4 3" fill="none" />

        {/* Zone labels */}
        <text x="120" y="32" textAnchor="middle" fontSize="8" fontWeight="600" fill="#0284c7" fontFamily="sans-serif">HR</text>
        <text x="120" y="118" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="sans-serif">Short OF</text>
        <text x="120" y="158" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="sans-serif">Infield</text>

        {/* Field labels */}
        <text x="120" y="65" textAnchor="middle" fontSize="9" fill="#6b7280" fontFamily="sans-serif">CF</text>
        <text x="26" y="95" textAnchor="middle" fontSize="9" fill="#6b7280" fontFamily="sans-serif">LF</text>
        <text x="214" y="95" textAnchor="middle" fontSize="9" fill="#6b7280" fontFamily="sans-serif">RF</text>

        {/* Selected location marker */}
        {dotX !== null && dotY !== null && (
          <g>
            <circle cx={dotX} cy={dotY} r="11" fill="#ef4444" opacity="0.25" />
            <circle cx={dotX} cy={dotY} r="5" fill="#ef4444" opacity="0.9" />
            <circle cx={dotX} cy={dotY} r="2" fill="white" />
          </g>
        )}
      </svg>
    </div>
  );
}

// ── Hitter tendency chart ──────────────────────────────────────────────────────
//
// Field divided into 5 sectors (LF / LC / CF / RC / RF) from home plate out to
// the outfield fence.  Each sector is a pie-slice path using the same arc geometry
// as the field diagram (home plate at 120,185, radius 150).
//
// Sector boundary points on the outfield arc (angles measured from +x, CCW):
//   -135° → (14,  79)  left foul line
//   -117° → (52,  51)  LF | LC
//    -99° → (97,  37)  LC | CF
//    -81° → (143, 37)  CF | RC
//    -63° → (188, 51)  RC | RF
//    -45° → (226, 79)  right foul line

const TEND_ZONES = [
  {
    id: 'lf',
    label: 'LF',
    path: 'M 120 185 L 14 79 A 150 150 0 0 1 52 51 Z',
    labelX: 48,  labelY: 108,
  },
  {
    id: 'lc',
    label: 'LC',
    path: 'M 120 185 L 52 51 A 150 150 0 0 1 97 37 Z',
    labelX: 81,  labelY: 80,
  },
  {
    id: 'cf',
    label: 'CF',
    path: 'M 120 185 L 97 37 A 150 150 0 0 1 143 37 Z',
    labelX: 120, labelY: 66,
  },
  {
    id: 'rc',
    label: 'RC',
    path: 'M 120 185 L 143 37 A 150 150 0 0 1 188 51 Z',
    labelX: 159, labelY: 80,
  },
  {
    id: 'rf',
    label: 'RF',
    path: 'M 120 185 L 188 51 A 150 150 0 0 1 226 79 Z',
    labelX: 192, labelY: 108,
  },
] as const;

type ZoneId = (typeof TEND_ZONES)[number]['id'];

function getZoneId(nx: number, ny: number): ZoneId {
  // angle from home plate in the SVG coordinate plane (y increases downward)
  const deg = Math.atan2(-ny, nx - 0.5) * (180 / Math.PI);
  if (deg < -117) return 'lf';
  if (deg < -99)  return 'lc';
  if (deg < -81)  return 'cf';
  if (deg < -63)  return 'rc';
  return 'rf';
}

function zoneColor(count: number): string {
  if (count === 0) return 'rgba(239,68,68,0.30)';
  if (count === 1) return 'rgba(245,158,11,0.45)';
  return 'rgba(34,197,94,0.50)';
}

function HitterTendencyChart({
  hitPoints,
  batterName,
  dataLabel = 'this game',
}: {
  hitPoints: { x: number; y: number }[];
  batterName: string;
  dataLabel?: string;
}) {
  const HX = 120, HY = 185, R = 150;

  const counts: Record<ZoneId, number> = { lf: 0, lc: 0, cf: 0, rc: 0, rf: 0 };
  for (const p of hitPoints) {
    counts[getZoneId(p.x, p.y)]++;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Hitting Tendency — {batterName}
        </p>
        <span className="text-xs text-gray-300">{hitPoints.length} hit{hitPoints.length !== 1 ? 's' : ''} {dataLabel}</span>
      </div>

      <svg viewBox="0 0 240 200" className="w-full rounded-lg border border-gray-200">
        {/* Sky background */}
        <rect width="240" height="200" fill="#e0f2fe" />

        {/* Zone fills — drawn before field features so features render on top */}
        {TEND_ZONES.map(({ id, path, label, labelX, labelY }) => (
          <g key={id}>
            <path d={path} fill={zoneColor(counts[id])} />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              fontSize="8"
              fontWeight="bold"
              fontFamily="sans-serif"
              fill="#374151"
              stroke="white"
              strokeWidth="2"
              paintOrder="stroke fill"
            >
              {label}
            </text>
          </g>
        ))}

        {/* Outfield wall */}
        <path d="M 14 79 A 150 150 0 0 1 226 79" stroke="#374151" strokeWidth="2.5" fill="none" />

        {/* Foul lines */}
        <line x1="120" y1="185" x2="14"  y2="79" stroke="#6b7280" strokeWidth="1" strokeDasharray="5 3" />
        <line x1="120" y1="185" x2="226" y2="79" stroke="#6b7280" strokeWidth="1" strokeDasharray="5 3" />

        {/* Infield dirt */}
        <circle cx="120" cy="132" r="52" fill="#d4a76a" />

        {/* Diamond grass + outline */}
        <polygon points="120,185 165,140 120,95 75,140" fill="#a3c97c" />
        <polygon points="120,185 165,140 120,95 75,140" fill="none" stroke="#374151" strokeWidth="1.5" />

        {/* Pitcher's mound */}
        <circle cx="120" cy="131" r="7" fill="#c8956c" stroke="#92644e" strokeWidth="1.5" />

        {/* Bases */}
        <rect x="159" y="134" width="12" height="12" fill="white" stroke="#374151" strokeWidth="1.5"
          transform="rotate(45,165,140)" />
        <rect x="114" y="89"  width="12" height="12" fill="white" stroke="#374151" strokeWidth="1.5"
          transform="rotate(45,120,95)" />
        <rect x="69"  y="134" width="12" height="12" fill="white" stroke="#374151" strokeWidth="1.5"
          transform="rotate(45,75,140)" />
        <polygon points="120,196 130,188 127,178 113,178 110,188" fill="white" stroke="#374151" strokeWidth="1.5" />

        {/* Individual hit markers */}
        {hitPoints.map((p, i) => {
          const cx = (p.x - 0.5) * R + HX;
          const cy = HY - p.y * R;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r="6" fill="#1d4ed8" opacity="0.2" />
              <circle cx={cx} cy={cy} r="3" fill="#1d4ed8" opacity="0.85" stroke="white" strokeWidth="1" />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.50)' }} />
          Rarely
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(245,158,11,0.65)' }} />
          Sometimes
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(34,197,94,0.65)' }} />
          Frequently
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-600 opacity-80" />
          Hit location
        </span>
      </div>
    </div>
  );
}

function EndGameButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      onClick={(e) => {
        if (!confirm('End the game and record the final score?')) e.preventDefault();
      }}
    >
      {pending ? 'Ending...' : 'End Game'}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function ScoringBoard({
  game,
  lineup,
  opponentLineup,
  initialEvents,
  currentUserId,
  isCoach,
  isDemo = false,
  seasonSprayPoints,
}: {
  game: GameRow;
  lineup: LineupEntry[];
  opponentLineup?: LineupEntry[];
  initialEvents: EventRow[];
  currentUserId: string;
  isCoach: boolean;
  isDemo?: boolean;
  seasonSprayPoints?: Record<string, { x: number; y: number }[]>;
}): JSX.Element {
  const [eventRows, setEventRows] = useState<EventRow[]>(initialEvents);
  const nextSeqNum = useRef(
    Math.max(...initialEvents.map((e) => e.sequence_number as number), 1) + 1,
  );

  // Track in-play state (waiting for hit/out result after pitch lands in play)
  const [inPlayPending, setInPlayPending] = useState(false);
  // Track error fielder selection sub-step (shown after clicking "Error" in the result buttons)
  const [errorPending, setErrorPending] = useState(false);
  // Track pitching change UI
  const [showPitchingChange, setShowPitchingChange] = useState(false);
  // Per-pitch annotations (optional, cleared after each pitch is recorded)
  const [pitchType, setPitchType] = useState<string | null>(null);
  const [zoneLocation, setZoneLocation] = useState<number | null>(null);
  const [sprayPoint, setSprayPoint] = useState<{ x: number; y: number } | null>(null);
  // End game form error
  const [endGameError, endGameFormAction] = useFormState(endGameAction, null);

  function resetAnnotations() {
    setPitchType(null);
    setZoneLocation(null);
    setSprayPoint(null);
    setErrorPending(false);
  }

  // Derive game state from events
  const events = eventRows.map(mapRowToEvent);
  const gameState = deriveGameState(game.id, events, game.teamId);

  // Sorted starters for batting order cycling
  const starters = lineup
    .filter((l) => l.battingOrder >= 1 && l.battingOrder <= 9)
    .sort((a, b) => a.battingOrder - b.battingOrder);

  // Current batter index in the lineup
  const currentBatterIndex = starters.findIndex((l) => l.playerId === gameState.currentBatterId);
  const currentBatter = starters[currentBatterIndex] ?? starters[0];


  // Is the opponent currently batting?
  // Home team bats in bottom (isTopOfInning = false); away team bats in top (true).
  const isOpponentBatting =
    game.locationType === 'home' ? gameState.isTopOfInning : !gameState.isTopOfInning;

  // Opponent starters sorted by batting order
  const opponentStarters = (opponentLineup ?? [])
    .filter((l) => l.battingOrder >= 1 && l.battingOrder <= 9)
    .sort((a, b) => a.battingOrder - b.battingOrder);

  // Derive current opponent batter index from completed PAs in the event log
  const TERMINAL_PA_EVENTS = new Set(['walk', 'strikeout', 'hit', 'out', 'hit_by_pitch']);
  const opponentBatsInTop = game.locationType === 'home';
  const completedOpponentPAs = eventRows.filter(
    (e) =>
      e.is_top_of_inning === opponentBatsInTop &&
      TERMINAL_PA_EVENTS.has(e.event_type as string),
  ).length;
  const opponentBatterIdx =
    opponentStarters.length > 0 ? completedOpponentPAs % opponentStarters.length : 0;
  const currentOpponentBatter = opponentStarters[opponentBatterIdx] ?? null;

  // The batter currently at the plate (our player or opponent)
  const activeBatter = isOpponentBatting ? currentOpponentBatter : currentBatter;
  const activeBatterId = activeBatter?.playerId ?? null;

  // Hit spray points for the tendency chart — season history + current game
  const tendencyHitPoints: { x: number; y: number }[] = (() => {
    if (isOpponentBatting || !currentBatter) return [];
    // Current game hits for this batter (from live event log)
    const currentGameHits = eventRows
      .filter((e) => {
        if (e.event_type !== 'hit') return false;
        const p = e.payload as Record<string, unknown>;
        return p.batterId === currentBatter.playerId && p.sprayX != null;
      })
      .map((e) => {
        const p = e.payload as Record<string, unknown>;
        return { x: p.sprayX as number, y: p.sprayY as number };
      });
    // Season history from completed past games (passed from server)
    const history = seasonSprayPoints?.[currentBatter.playerId] ?? [];
    return [...history, ...currentGameHits];
  })();

  // Whether the tendency data comes from season history or just this game (demo)
  const tendencyLabel = seasonSprayPoints ? 'this season' : 'this game';

  // Player name lookup (searches both lineups)
  const playerName = (playerId: string | null) => {
    if (!playerId) return '—';
    const entry = [...lineup, ...(opponentLineup ?? [])].find((l) => l.playerId === playerId);
    if (!entry) return '—';
    return `${entry.player.lastName} #${entry.player.jerseyNumber ?? '—'}`;
  };

  // ── Realtime subscription (skipped in demo mode) ─────────────────────────
  useEffect(() => {
    if (isDemo) return;
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`game:${game.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_events',
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          setEventRows((prev) => {
            if (prev.some((e) => e.id === payload.new.id)) return prev;
            return [...prev, payload.new].sort(
              (a, b) => (a.sequence_number as number) - (b.sequence_number as number),
            );
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [game.id, isDemo]);

  // ── Event recording ──────────────────────────────────────────────────────
  const recordEvent = useCallback(
    async (eventType: string, payload: Record<string, unknown>) => {
      const seq = nextSeqNum.current++;
      const newRow: EventRow = {
        id: crypto.randomUUID(),
        game_id: game.id,
        sequence_number: seq,
        event_type: eventType,
        inning: gameState.inning,
        is_top_of_inning: gameState.isTopOfInning,
        payload,
        occurred_at: new Date().toISOString(),
        created_by: currentUserId,
        device_id: 'web',
      };

      if (isDemo) {
        setEventRows((prev) => [...prev, newRow]);
        return;
      }

      const supabase = createBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('game_events').upsert(
        newRow as any,
        { onConflict: 'id', ignoreDuplicates: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.id, gameState.inning, gameState.isTopOfInning, currentUserId, isDemo],
  );

  // ── Demo reset ────────────────────────────────────────────────────────────
  function handleReset() {
    setEventRows(initialEvents);
    nextSeqNum.current = Math.max(...initialEvents.map((e) => e.sequence_number as number), 1) + 1;
    setInPlayPending(false);
    setShowPitchingChange(false);
    resetAnnotations();
  }

  // ── Pitch handlers ────────────────────────────────────────────────────────

  async function handlePitch(outcome: string) {
    const batterId = activeBatterId;
    const pitcherId = gameState.currentPitcherId;
    if (!batterId || !pitcherId) return;

    if (outcome === 'in_play') {
      setInPlayPending(true);
      return;
    }

    const extra: Record<string, unknown> = {};
    if (pitchType) extra.pitchType = pitchType;
    if (zoneLocation !== null) extra.zoneLocation = zoneLocation;

    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome, ...extra });
    resetAnnotations();

    // Walk via 4th ball
    if (outcome === 'ball' && gameState.balls + 1 >= 4) {
      await recordEvent('walk', { batterId, pitcherId });
    }
    // Strikeout via swinging/called strike on 2-strike count
    if ((outcome === 'swinging_strike' || outcome === 'called_strike' || outcome === 'foul_tip') &&
        gameState.strikes + 1 >= 3) {
      await recordEvent('strikeout', { batterId, pitcherId, outType: 'strikeout' });
    }
  }

  async function handleInPlay(result: 'single' | 'double' | 'triple' | 'home_run' | 'out' | 'field_choice') {
    setInPlayPending(false);
    const batterId = activeBatterId;
    const pitcherId = gameState.currentPitcherId;
    if (!batterId || !pitcherId) return;

    // Capture annotation values before resetting
    const pitchExtra: Record<string, unknown> = {};
    if (pitchType) pitchExtra.pitchType = pitchType;
    if (zoneLocation !== null) pitchExtra.zoneLocation = zoneLocation;

    const sprayExtra: Record<string, unknown> = sprayPoint
      ? { sprayX: sprayPoint.x, sprayY: sprayPoint.y }
      : {};

    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome: 'in_play', ...pitchExtra });
    resetAnnotations();

    if (result === 'out' || result === 'field_choice') {
      await recordEvent('out', { batterId, pitcherId, outType: 'other', ...sprayExtra });
    } else {
      await recordEvent('hit', { batterId, pitcherId, hitType: result, rbis: 0, ...sprayExtra });
    }
  }

  async function handleError(errorPosition: string) {
    setInPlayPending(false);
    setErrorPending(false);
    const batterId = activeBatterId;
    const pitcherId = gameState.currentPitcherId;
    if (!batterId || !pitcherId) return;

    const pitchExtra: Record<string, unknown> = {};
    if (pitchType) pitchExtra.pitchType = pitchType;
    if (zoneLocation !== null) pitchExtra.zoneLocation = zoneLocation;

    const sprayExtra: Record<string, unknown> = sprayPoint
      ? { sprayX: sprayPoint.x, sprayY: sprayPoint.y }
      : {};

    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome: 'in_play', ...pitchExtra });
    resetAnnotations();
    await recordEvent('field_error', { batterId, pitcherId, errorPosition, ...sprayExtra });
  }

  async function handleWalk() {
    const batterId = activeBatterId;
    const pitcherId = gameState.currentPitcherId;
    if (!batterId || !pitcherId) return;
    await recordEvent('walk', { batterId, pitcherId });
  }

  async function handleStrikeout() {
    const batterId = activeBatterId;
    const pitcherId = gameState.currentPitcherId;
    if (!batterId || !pitcherId) return;
    await recordEvent('strikeout', { batterId, pitcherId, outType: 'strikeout' });
  }

  async function handleHBP() {
    const batterId = activeBatterId;
    const pitcherId = gameState.currentPitcherId;
    if (!batterId || !pitcherId) return;
    const extra: Record<string, unknown> = {};
    if (pitchType) extra.pitchType = pitchType;
    if (zoneLocation !== null) extra.zoneLocation = zoneLocation;
    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome: 'hit_by_pitch', ...extra });
    resetAnnotations();
    await recordEvent('hit_by_pitch', { batterId, pitcherId });
  }

  async function handleWildPitch() {
    const batterId = activeBatterId;
    const pitcherId = gameState.currentPitcherId;
    if (!batterId || !pitcherId) return;
    const extra: Record<string, unknown> = {};
    if (pitchType) extra.pitchType = pitchType;
    if (zoneLocation !== null) extra.zoneLocation = zoneLocation;
    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome: 'ball', isWildPitch: true, ...extra });
    resetAnnotations();
    if (gameState.balls + 1 >= 4) {
      await recordEvent('walk', { batterId, pitcherId });
    }
  }

  async function handlePassedBall() {
    const batterId = activeBatterId;
    const pitcherId = gameState.currentPitcherId;
    if (!batterId || !pitcherId) return;
    const extra: Record<string, unknown> = {};
    if (pitchType) extra.pitchType = pitchType;
    if (zoneLocation !== null) extra.zoneLocation = zoneLocation;
    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome: 'ball', isPassedBall: true, ...extra });
    resetAnnotations();
    if (gameState.balls + 1 >= 4) {
      await recordEvent('walk', { batterId, pitcherId });
    }
  }

  async function handleInningChange() {
    await recordEvent('inning_change', {});
  }

  async function handlePitchingChange(newPitcherId: string) {
    const outgoingPitcherId = gameState.currentPitcherId ?? '';
    await recordEvent('pitching_change', { newPitcherId, outgoingPitcherId });
    setShowPitchingChange(false);
  }

  // Both pitch type AND zone location must be selected before recording a pitch outcome
  const pitchAnnotationsReady = pitchType !== null && zoneLocation !== null;

  const vsAt = game.locationType === 'away' ? '@' : 'vs';
  const usScore = game.locationType === 'home' ? gameState.homeScore : gameState.awayScore;
  const themScore = game.locationType === 'home' ? gameState.awayScore : gameState.homeScore;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link
          href={isDemo ? '/games' : `/games/${game.id}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← {isDemo ? 'Exit Demo' : 'Back'}
        </Link>
        <h1 className="text-sm font-semibold text-gray-700">
          {vsAt} {game.opponentName}
        </h1>
        {isDemo ? (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
            Demo
          </span>
        ) : (
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
            In Progress
          </span>
        )}
      </div>

      {/* ── Demo Mode Banner ─────────────────────────────────── */}
      {isDemo && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-800">Practice Mode</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Try the scoring controls. No data is saved — this is just for learning.
              </p>
            </div>
            <button
              onClick={handleReset}
              className="shrink-0 text-xs font-medium text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Reset Game
            </button>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* ── Scoreboard ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Inning</p>
              <p className="text-2xl font-bold text-gray-900">
                {gameState.inning}
                <span className="text-base ml-1">{gameState.isTopOfInning ? '▲' : '▼'}</span>
              </p>
            </div>
            <div className="flex items-center gap-6 text-center">
              <div>
                <p className="text-xs text-gray-400 font-medium">Us</p>
                <p className="text-3xl font-bold text-gray-900">{usScore}</p>
              </div>
              <div className="text-gray-300 text-xl">—</div>
              <div>
                <p className="text-xs text-gray-400 font-medium">{game.opponentName}</p>
                <p className="text-3xl font-bold text-gray-900">{themScore}</p>
              </div>
            </div>
          </div>

          {/* Count */}
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500 font-medium mt-2">
            <div className="flex items-center gap-1.5">
              <span>B</span>
              {[0,1,2,3].map((i) => <Dot key={i} filled={i < gameState.balls} color="bg-green-500 border-green-600" />)}
            </div>
            <div className="flex items-center gap-1.5">
              <span>S</span>
              {[0,1].map((i) => <Dot key={i} filled={i < gameState.strikes} color="bg-yellow-400 border-yellow-500" />)}
            </div>
            <div className="flex items-center gap-1.5">
              <span>O</span>
              {[0,1].map((i) => <Dot key={i} filled={i < gameState.outs} color="bg-red-500 border-red-600" />)}
            </div>
          </div>
        </div>

        {/* ── Baserunners + Current Players ────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-2 gap-4 items-center">
          <BaserunnerDiamond runners={gameState.runnersOnBase} />
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Batting</p>
              <p className="font-semibold text-gray-900">{playerName(activeBatterId)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Pitching</p>
              <p className="font-semibold text-gray-900">
                {playerName(gameState.currentPitcherId)}
              </p>
              {gameState.currentPitcherPitchCount > 0 && (
                <p className="text-xs text-gray-400">{gameState.currentPitcherPitchCount} pitches</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Batter Tendency Chart (our team batting only) ────────── */}
        {!isOpponentBatting && currentBatter && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <HitterTendencyChart
              hitPoints={tendencyHitPoints}
              batterName={`${currentBatter.player.lastName} #${currentBatter.player.jerseyNumber ?? '—'}`}
              dataLabel={tendencyLabel}
            />
          </div>
        )}

        {/* ── Pitch Controls (coaches only) ─────────────────────── */}
        {isCoach && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

            {/* Pitch type + zone selectors — shown whenever a pitch can be recorded */}
            {gameState.outs < 3 && (
              <div className="space-y-3 pb-3 border-b border-gray-100">
                <PitchTypeSelector selected={pitchType} onSelect={setPitchType} />
                <StrikeZoneGrid selected={zoneLocation} onSelect={setZoneLocation} />
              </div>
            )}

            {gameState.outs >= 3 ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700 mb-3">3 outs — end of half-inning</p>
                <button
                  onClick={handleInningChange}
                  className="w-full bg-brand-700 text-white font-semibold py-3 rounded-lg hover:bg-brand-800 transition-colors"
                >
                  New Inning →
                </button>
              </div>
            ) : inPlayPending ? (
              <div className="space-y-3">
                {/* Field spray chart — mark where the ball was hit/error occurred */}
                <SprayChartPicker value={sprayPoint} onChange={setSprayPoint} />

                {errorPending ? (
                  /* ── Error fielder picker ── */
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Who made the error?
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].map((pos) => (
                        <button
                          key={pos}
                          onClick={() => handleError(pos)}
                          className="py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setErrorPending(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 mt-2 block"
                    >
                      ← Back to result
                    </button>
                  </div>
                ) : (
                  /* ── Result buttons ── */
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      In play — what happened?
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['single', 'double', 'triple', 'home_run', 'out', 'field_choice'] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => handleInPlay(r)}
                          disabled={!sprayPoint}
                          className="py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:hover:bg-gray-50 capitalize"
                        >
                          {r === 'home_run' ? 'HR' : r === 'field_choice' ? 'FC' : r.charAt(0).toUpperCase() + r.slice(1)}
                        </button>
                      ))}
                      <button
                        onClick={() => setErrorPending(true)}
                        disabled={!sprayPoint}
                        className="py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:hover:bg-red-50"
                      >
                        Error
                      </button>
                    </div>
                    {!sprayPoint && (
                      <p className="text-xs text-gray-400 mt-2">Tap the field above to mark where the ball was hit</p>
                    )}
                  </div>
                )}

                <button
                  onClick={() => { setInPlayPending(false); setErrorPending(false); setSprayPoint(null); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pitch outcome</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Ball', outcome: 'ball' },
                      { label: 'Called K', outcome: 'called_strike' },
                      { label: 'Swing K', outcome: 'swinging_strike' },
                      { label: 'Foul', outcome: 'foul' },
                    ].map(({ label, outcome }) => (
                      <button
                        key={outcome}
                        onClick={() => handlePitch(outcome)}
                        disabled={!pitchAnnotationsReady}
                        className="py-2.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-gray-300 bg-white hover:bg-gray-50 disabled:hover:bg-white"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={handleWildPitch}
                      disabled={!pitchAnnotationsReady}
                      className="py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:hover:bg-orange-50"
                    >
                      WP — Wild Pitch
                    </button>
                    <button
                      onClick={handlePassedBall}
                      disabled={!pitchAnnotationsReady}
                      className="py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:hover:bg-orange-50"
                    >
                      PB — Passed Ball
                    </button>
                  </div>
                  {!pitchAnnotationsReady && (
                    <p className="text-xs text-gray-400 mt-2">Select pitch type and location above to enable</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Plate result</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'In Play', outcome: 'in_play', handler: () => handlePitch('in_play'), disabled: !pitchAnnotationsReady },
                      { label: 'HBP', outcome: 'hbp', handler: handleHBP, disabled: !pitchAnnotationsReady },
                      { label: 'Walk', outcome: 'walk', handler: handleWalk, disabled: gameState.balls < 3 },
                      { label: 'Strikeout', outcome: 'strikeout', handler: handleStrikeout, disabled: gameState.strikes < 2 },
                    ].map(({ label, outcome, handler, disabled }) => (
                      <button
                        key={outcome}
                        onClick={handler}
                        disabled={disabled}
                        className="py-2.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:hover:bg-brand-50"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Pitching Change ────────────────────────────────────── */}
        {isCoach && !showPitchingChange && (
          <button
            onClick={() => setShowPitchingChange(true)}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            Pitching change…
          </button>
        )}
        {isCoach && showPitchingChange && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Select new pitcher</p>
            <div className="space-y-1">
              {lineup
                .filter((l) => l.playerId !== gameState.currentPitcherId)
                .map((l) => (
                  <button
                    key={l.playerId}
                    onClick={() => handlePitchingChange(l.playerId)}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {l.player.lastName}, {l.player.firstName}
                    {l.player.jerseyNumber != null && (
                      <span className="text-gray-400 ml-1">#{l.player.jerseyNumber}</span>
                    )}
                  </button>
                ))}
            </div>
            <button
              onClick={() => setShowPitchingChange(false)}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── End Game / Demo exit ────────────────────────────────── */}
        {isCoach && (
          <div className="border-t border-gray-200 pt-4">
            {isDemo ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="text-sm bg-amber-100 text-amber-800 hover:bg-amber-200 px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Reset Game
                </button>
                <Link
                  href="/games"
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Exit Demo
                </Link>
              </div>
            ) : (
              <form action={endGameFormAction}>
                <input type="hidden" name="gameId" value={game.id} />
                <input type="hidden" name="homeScore" value={String(gameState.homeScore)} />
                <input type="hidden" name="awayScore" value={String(gameState.awayScore)} />
                <input type="hidden" name="inning" value={String(gameState.inning)} />
                <input type="hidden" name="isTopOfInning" value={String(gameState.isTopOfInning)} />
                {endGameError && (
                  <p className="text-sm text-red-600 mb-2">{endGameError}</p>
                )}
                <EndGameButton />
              </form>
            )}
          </div>
        )}

        {/* Read-only notice for non-coaches */}
        {!isCoach && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 text-center">
            Live scoring in progress — updates appear automatically.
          </div>
        )}
      </div>
    </div>
  );
}
