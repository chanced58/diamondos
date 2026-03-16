'use client';

import type { JSX } from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { deriveGameState, FIELDING_POSITION_NUMBERS, formatFieldingSequence } from '@baseball/shared';
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
    id: string | null;
    firstName: string;
    lastName: string;
    // number for our players (integer DB column); string for opponent players (text DB column)
    jerseyNumber: number | string | null;
  };
};

type RosterEntry = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | string | null;
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

function BaserunnerDiamond({
  runners,
  labels,
}: {
  runners: { first: string | null; second: string | null; third: string | null };
  labels?: { first?: string | null; second?: string | null; third?: string | null };
}) {
  function Base({ occupied, label, className }: { occupied: boolean; label?: string | null; className: string }) {
    return (
      <div className={`absolute w-7 h-7 rotate-45 border-2 overflow-hidden ${occupied ? 'bg-brand-500 border-brand-600' : 'bg-white border-gray-400'} ${className}`}>
        {occupied && label && (
          <span className="absolute inset-0 flex items-center justify-center -rotate-45 text-[7px] font-bold text-white leading-none pointer-events-none">
            {label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-24 h-24 mx-auto">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-14 h-14">
          {/* Second base — top */}
          <Base occupied={!!runners.second} label={labels?.second} className="top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          {/* First base — right */}
          <Base occupied={!!runners.first}  label={labels?.first}  className="top-1/2 right-0 translate-x-1/2 -translate-y-1/2" />
          {/* Third base — left */}
          <Base occupied={!!runners.third}  label={labels?.third}  className="top-1/2 left-0 -translate-x-1/2 -translate-y-1/2" />
          {/* Home plate — bottom */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-7 h-7 rotate-45 border-2 bg-gray-200 border-gray-400" />
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

// ── Batter spray chart (count-filtered) ───────────────────────────────────────
//
// Shows all season hit locations as faded gray dots; dots matching the
// current ball-strike count are highlighted in blue.  Positioned inline,
// next to the StrikeZoneGrid inside the pitch controls card.
//
// SVG coordinate system: home plate at (HX=120, HY=185), field radius R=150.
// Normalized coords: sprayX 0=left, 0.5=center, 1=right; sprayY 0=HP, 1=deep CF.

type SprayPt = { x: number; y: number; balls: number; strikes: number };

function BatterSprayChart({
  allHitPoints,
  currentBalls,
  currentStrikes,
}: {
  allHitPoints: SprayPt[];
  currentBalls: number;
  currentStrikes: number;
}) {
  const HX = 120, HY = 185, R = 150;

  const countMatch = allHitPoints.filter(
    (p) => p.balls === currentBalls && p.strikes === currentStrikes,
  );
  const others = allHitPoints.filter(
    (p) => !(p.balls === currentBalls && p.strikes === currentStrikes),
  );

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Spray{' '}
        <span className="font-normal normal-case text-gray-300">
          {currentBalls}-{currentStrikes} ({countMatch.length}/{allHitPoints.length})
        </span>
      </p>
      <svg viewBox="0 0 240 200" className="w-full rounded-lg border border-gray-200">
        {/* Sky / foul territory */}
        <rect width="240" height="200" fill="#e0f2fe" />
        {/* Fair territory */}
        <path d="M 120 185 L 14 79 A 150 150 0 0 1 226 79 Z" fill="#bbf7d0" />
        {/* Outfield wall */}
        <path d="M 14 79 A 150 150 0 0 1 226 79" stroke="#374151" strokeWidth="2.5" fill="none" />
        {/* Infield dirt */}
        <circle cx="120" cy="132" r="52" fill="#d4a76a" />
        {/* Diamond grass */}
        <polygon points="120,185 165,140 120,95 75,140" fill="#a3c97c" />
        <polygon points="120,185 165,140 120,95 75,140" fill="none" stroke="#374151" strokeWidth="1" />
        {/* Pitcher's mound */}
        <circle cx="120" cy="131" r="6" fill="#c8956c" stroke="#92644e" strokeWidth="1" />
        {/* Bases */}
        <rect x="159" y="134" width="10" height="10" fill="white" stroke="#374151" strokeWidth="1"
          transform="rotate(45,165,140)" />
        <rect x="114" y="89" width="10" height="10" fill="white" stroke="#374151" strokeWidth="1"
          transform="rotate(45,120,95)" />
        <rect x="69" y="134" width="10" height="10" fill="white" stroke="#374151" strokeWidth="1"
          transform="rotate(45,75,140)" />
        <polygon points="120,195 128,188 125,179 115,179 112,188" fill="white" stroke="#374151" strokeWidth="1" />
        {/* Foul lines */}
        <line x1="120" y1="185" x2="14"  y2="79" stroke="#6b7280" strokeWidth="1" strokeDasharray="5 3" />
        <line x1="120" y1="185" x2="226" y2="79" stroke="#6b7280" strokeWidth="1" strokeDasharray="5 3" />

        {/* All other-count hits (faded gray) */}
        {others.map((p, i) => (
          <circle
            key={i}
            cx={(p.x - 0.5) * R + HX}
            cy={HY - p.y * R}
            r="4"
            fill="#94a3b8"
            opacity="0.35"
          />
        ))}

        {/* Current-count hits (highlighted blue) */}
        {countMatch.map((p, i) => {
          const cx = (p.x - 0.5) * R + HX;
          const cy = HY - p.y * R;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r="8" fill="#1d4ed8" opacity="0.18" />
              <circle cx={cx} cy={cy} r="4" fill="#1d4ed8" opacity="0.9" stroke="white" strokeWidth="1.5" />
            </g>
          );
        })}

        {/* No data hint */}
        {allHitPoints.length === 0 && (
          <text x="120" y="120" textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
            No hit data yet
          </text>
        )}
      </svg>

      {/* Mini legend */}
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-600 opacity-80" />
          {currentBalls}-{currentStrikes} count
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-slate-400 opacity-50" />
          Other counts
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

// ── Scoring config ─────────────────────────────────────────────────────────────

type ScoringConfig = {
  pitchType: boolean;
  pitchLocation: boolean;
  sprayChart: boolean;
};

const DEFAULT_CONFIG: ScoringConfig = {
  pitchType: true,
  pitchLocation: true,
  sprayChart: true,
};

function ConfigToggle({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
          checked ? 'bg-brand-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function ScoringBoard({
  game,
  lineup,
  opponentLineup,
  teamRoster,
  opponentRoster,
  initialEvents,
  currentUserId,
  isCoach,
  isDemo = false,
  seasonSprayPoints,
  scoringConfig: initialScoringConfig,
}: {
  game: GameRow;
  lineup: LineupEntry[];
  opponentLineup?: LineupEntry[];
  teamRoster?: RosterEntry[];
  opponentRoster?: RosterEntry[];
  initialEvents: EventRow[];
  currentUserId: string;
  isCoach: boolean;
  isDemo?: boolean;
  seasonSprayPoints?: Record<string, SprayPt[]>;
  scoringConfig?: ScoringConfig;
}): JSX.Element {
  const [eventRows, setEventRows] = useState<EventRow[]>(initialEvents);
  const nextSeqNum = useRef(
    Math.max(...initialEvents.map((e) => e.sequence_number as number), 1) + 1,
  );

  // Local scoring config — starts from the game_start event, overridable during the game
  const [localConfig, setLocalConfig] = useState<ScoringConfig>(
    initialScoringConfig ?? DEFAULT_CONFIG,
  );
  const [showSettings, setShowSettings] = useState(false);

  // Track in-play state (waiting for hit/out result after pitch lands in play)
  const [inPlayPending, setInPlayPending] = useState(false);
  // The result type chosen (single/double/etc/error) — waiting for trajectory selection
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  // Trajectory captured during error flow (stored until fielder is selected)
  const [pendingTrajectory, setPendingTrajectory] = useState<string | null>(null);
  // Track error fielder selection sub-step (shown after trajectory is picked for errors)
  const [errorPending, setErrorPending] = useState(false);
  // Track fielding sequence for outs (e.g., [6, 3] = SS to 1B)
  const [fieldingSequencePending, setFieldingSequencePending] = useState(false);
  const [fieldingSequence, setFieldingSequence] = useState<number[]>([]);
  // Stashed result/trajectory for the fielding sequence step (so pendingResult can be cleared)
  const [stashedOutResult, setStashedOutResult] = useState<string | null>(null);
  // Track pitching change UI
  const [showPitchingChange, setShowPitchingChange] = useState(false);
  // Pending baserunner advance — waiting for reason selection
  const [pendingAdvance, setPendingAdvance] = useState<{
    runnerId: string;
    fromBase: 1 | 2 | 3;
    toBase: 2 | 3 | 4;
  } | null>(null);
  const [advanceErrorBy, setAdvanceErrorBy] = useState<number | null>(null);
  // Rundown panel state
  const [showRundown, setShowRundown] = useState(false);
  const [rundownRunnerId, setRundownRunnerId] = useState('');
  const [rundownThrowSeq, setRundownThrowSeq] = useState<number[]>([]);
  const [rundownOutcome, setRundownOutcome] = useState<'out' | 'safe' | null>(null);
  const [rundownSafeBase, setRundownSafeBase] = useState<1 | 2 | 3 | null>(null);
  // Substitution panel state
  const [showSubstitution, setShowSubstitution] = useState(false);
  const [subTeam, setSubTeam] = useState<'us' | 'opponent'>('us');
  const [subType, setSubType] = useState<'pinch_hitter' | 'pinch_runner' | 'defensive' | null>(null);
  const [subOutPlayerId, setSubOutPlayerId] = useState('');
  const [subInPlayerId, setSubInPlayerId] = useState('');
  const [subRunnerBase, setSubRunnerBase] = useState<1 | 2 | 3 | null>(null);
  const [subNewPosition, setSubNewPosition] = useState('');
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
    setPendingResult(null);
    setPendingTrajectory(null);
    setFieldingSequencePending(false);
    setFieldingSequence([]);
    setStashedOutResult(null);
  }

  // Derive game state from events
  const events = eventRows.map(mapRowToEvent);
  const gameState = deriveGameState(game.id, events, game.teamId);

  // Sorted starters for batting order cycling
  const starters = lineup
    .filter((l) => l.battingOrder >= 1 && l.battingOrder <= 9)
    .sort((a, b) => a.battingOrder - b.battingOrder);

  // Is the opponent currently batting?
  // Home team bats in bottom (isTopOfInning = false); away team bats in top (true).
  const isOpponentBatting =
    game.locationType === 'home' ? gameState.isTopOfInning : !gameState.isTopOfInning;

  // Opponent starters sorted by batting order
  const opponentStarters = (opponentLineup ?? [])
    .filter((l) => l.battingOrder >= 1 && l.battingOrder <= 9)
    .sort((a, b) => a.battingOrder - b.battingOrder);

  // Derive current batter from the PA counts tracked by deriveGameState.
  // completedTopHalfPAs / completedBottomHalfPAs accumulate across the whole game;
  // modulo lineup size gives the correct batting-order position for each team.
  const opponentBatsInTop = game.locationType === 'home';

  // Apply substitution events to produce effective lineups so pinch hitters
  // (and other subs) are reflected in the batter display.
  function applySubstitutions(
    base: LineupEntry[],
    roster: RosterEntry[] | undefined,
    forOpponent: boolean,
  ): LineupEntry[] {
    const result = base.map((s) => ({ ...s, player: { ...s.player } }));
    for (const row of eventRows) {
      if ((row.event_type as string) !== 'substitution') continue;
      const p = (row.payload ?? {}) as Record<string, unknown>;
      if (Boolean(p.isOpponentSubstitution) !== forOpponent) continue;
      const outId = p.outPlayerId as string;
      const inId  = p.inPlayerId  as string;
      const idx = result.findIndex((s) => s.playerId === outId);
      if (idx === -1) continue;
      const rosterEntry = (roster ?? []).find((r) => r.id === inId);
      result[idx] = {
        ...result[idx],
        playerId: inId,
        player: rosterEntry
          ? { id: inId, firstName: rosterEntry.firstName, lastName: rosterEntry.lastName, jerseyNumber: rosterEntry.jerseyNumber }
          : { id: inId, firstName: 'Sub', lastName: 'Player', jerseyNumber: null },
      };
    }
    return result;
  }

  const effectiveStarters         = applySubstitutions(starters,         teamRoster,     false);
  const effectiveOpponentStarters = applySubstitutions(opponentStarters, opponentRoster, true);

  const completedTeamPAs = opponentBatsInTop
    ? gameState.completedBottomHalfPAs
    : gameState.completedTopHalfPAs;
  const currentBatterIdx = effectiveStarters.length > 0 ? completedTeamPAs % effectiveStarters.length : 0;
  const currentBatter = effectiveStarters[currentBatterIdx] ?? effectiveStarters[0];

  const completedOpponentPAs = opponentBatsInTop
    ? gameState.completedTopHalfPAs
    : gameState.completedBottomHalfPAs;
  const opponentBatterIdx =
    effectiveOpponentStarters.length > 0 ? completedOpponentPAs % effectiveOpponentStarters.length : 0;
  const currentOpponentBatter = effectiveOpponentStarters[opponentBatterIdx] ?? null;

  // The batter currently at the plate (our player or opponent)
  const activeBatter = isOpponentBatting ? currentOpponentBatter : currentBatter;
  const activeBatterId = activeBatter?.playerId ?? null;

  // Hit spray points with count-at-contact — season history + current game.
  // We replay the current game's events to track the ball-strike count at the
  // moment each ball was put in play, then tag those hits with (balls, strikes).
  const tendencyHitPointsWithCount: SprayPt[] = (() => {
    if (isOpponentBatting || !currentBatter) return [];

    // Replay current game events to derive count at contact for each hit
    const currentGameHits: SprayPt[] = [];
    let balls = 0, strikes = 0;
    let prevBatterId: string | null = null;
    let contactCount: { balls: number; strikes: number } | null = null;

    for (const row of eventRows) {
      const etype = row.event_type as string;
      const p = (row.payload ?? {}) as Record<string, unknown>;

      if (etype === 'pitch_thrown') {
        const bid = p.batterId as string;
        if (bid !== prevBatterId) {
          balls = 0; strikes = 0; prevBatterId = bid; contactCount = null;
        }
        const outcome = p.outcome as string;
        if (outcome === 'in_play') {
          contactCount = { balls, strikes };
        } else if (outcome === 'ball' || outcome === 'intentional_ball') {
          if (balls < 3) balls++;
        } else if (
          outcome === 'called_strike' || outcome === 'swinging_strike' || outcome === 'foul_tip'
        ) {
          if (strikes < 2) strikes++;
        } else if (outcome === 'foul') {
          if (strikes < 2) strikes++;
        }
      } else if (etype === 'hit') {
        if (p.batterId === currentBatter.playerId && p.sprayX != null && contactCount) {
          currentGameHits.push({
            x: p.sprayX as number,
            y: (p.sprayY ?? 0) as number,
            balls: contactCount.balls,
            strikes: contactCount.strikes,
          });
        }
        balls = 0; strikes = 0; prevBatterId = null; contactCount = null;
      } else if (
        ['walk', 'strikeout', 'out', 'hit_by_pitch', 'sacrifice_fly',
          'sacrifice_bunt', 'field_error', 'double_play', 'inning_change'].includes(etype)
      ) {
        balls = 0; strikes = 0; prevBatterId = null; contactCount = null;
      }
    }

    // Merge season history (server-side) with current game hits
    const history: SprayPt[] = seasonSprayPoints?.[currentBatter.playerId] ?? [];
    return [...history, ...currentGameHits];
  })();

  // Player name lookup (searches both lineups)
  const playerName = (playerId: string | null) => {
    if (!playerId) return '—';
    const entry = [...lineup, ...(opponentLineup ?? [])].find((l) => l.playerId === playerId);
    if (!entry) return '—';
    return `${entry.player.lastName} #${entry.player.jerseyNumber ?? '—'}`;
  };

  // Jersey-number label for the baserunner diamond (short form: "#7")
  const runnerJerseyLabel = (playerId: string | null): string | null => {
    if (!playerId) return null;
    const entry = [...lineup, ...(opponentLineup ?? [])].find((l) => l.playerId === playerId);
    return entry?.player.jerseyNumber != null ? `#${entry.player.jerseyNumber}` : null;
  };

  const runnerLabels = {
    first:  runnerJerseyLabel(gameState.runnersOnBase.first),
    second: runnerJerseyLabel(gameState.runnersOnBase.second),
    third:  runnerJerseyLabel(gameState.runnersOnBase.third),
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

      // Optimistically add the event to local state immediately so the UI
      // reflects the new count/outcome without waiting for Realtime round-trip.
      // The Realtime subscription deduplicates by id, so the echoed insert is a no-op.
      setEventRows((prev) => [...prev, newRow]);

      if (isDemo) return;

      const supabase = createBrowserClient();
      await supabase.from('game_events').upsert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newRow as any,
        { onConflict: 'id', ignoreDuplicates: true },
      );
    },
    [game.id, gameState.inning, gameState.isTopOfInning, currentUserId, isDemo],
  );

  // ── Demo reset ────────────────────────────────────────────────────────────
  function handleReset() {
    setEventRows(initialEvents);
    nextSeqNum.current = Math.max(...initialEvents.map((e) => e.sequence_number as number), 1) + 1;
    setInPlayPending(false);
    setShowPitchingChange(false);
    resetAnnotations();
    setPendingResult(null);
    setPendingTrajectory(null);
  }

  // ── Pitch handlers ────────────────────────────────────────────────────────

  async function handlePitch(outcome: string) {
    const batterId = activeBatterId ?? 'unknown-batter';
    const pitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';

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

  async function handleInPlay(result: string, trajectory: string, sequence?: number[]) {
    setInPlayPending(false);
    setPendingResult(null);
    const batterId = activeBatterId ?? 'unknown-batter';
    const pitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';

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
      const outTypeMap: Record<string, string> = {
        ground_ball: 'groundout',
        line_drive:  'lineout',
        fly_ball:    'flyout',
      };
      const outType = outTypeMap[trajectory] ?? 'other';
      const seqExtra: Record<string, unknown> = sequence && sequence.length > 0
        ? { fieldingSequence: sequence }
        : {};
      await recordEvent('out', { batterId, pitcherId, outType, trajectory, ...sprayExtra, ...seqExtra });
    } else {
      await recordEvent('hit', { batterId, pitcherId, hitType: result, trajectory, rbis: 0, ...sprayExtra });
    }
  }

  async function handleError(errorPosition: string) {
    setInPlayPending(false);
    setErrorPending(false);
    const batterId = activeBatterId ?? 'unknown-batter';
    const pitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';

    const pitchExtra: Record<string, unknown> = {};
    if (pitchType) pitchExtra.pitchType = pitchType;
    if (zoneLocation !== null) pitchExtra.zoneLocation = zoneLocation;

    const sprayExtra: Record<string, unknown> = sprayPoint
      ? { sprayX: sprayPoint.x, sprayY: sprayPoint.y }
      : {};

    // Capture trajectory before resetAnnotations clears it
    const trajectory = pendingTrajectory;

    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome: 'in_play', ...pitchExtra });
    resetAnnotations();
    await recordEvent('field_error', {
      batterId, pitcherId, errorPosition,
      ...(trajectory ? { trajectory } : {}),
      ...sprayExtra,
    });
  }

  async function handleWalk() {
    const batterId = activeBatterId ?? 'unknown-batter';
    const pitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';
    await recordEvent('walk', { batterId, pitcherId });
  }

  async function handleStrikeout() {
    const batterId = activeBatterId ?? 'unknown-batter';
    const pitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';
    await recordEvent('strikeout', { batterId, pitcherId, outType: 'strikeout' });
  }

  async function handleHBP() {
    const batterId = activeBatterId ?? 'unknown-batter';
    const pitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';
    const extra: Record<string, unknown> = {};
    if (pitchType) extra.pitchType = pitchType;
    if (zoneLocation !== null) extra.zoneLocation = zoneLocation;
    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome: 'hit_by_pitch', ...extra });
    resetAnnotations();
    await recordEvent('hit_by_pitch', { batterId, pitcherId });
  }

  async function handleWildPitch() {
    const batterId = activeBatterId ?? 'unknown-batter';
    const pitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';
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
    const batterId = activeBatterId ?? 'unknown-batter';
    const pitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';
    const extra: Record<string, unknown> = {};
    if (pitchType) extra.pitchType = pitchType;
    if (zoneLocation !== null) extra.zoneLocation = zoneLocation;
    await recordEvent('pitch_thrown', { pitcherId, batterId, outcome: 'ball', isPassedBall: true, ...extra });
    resetAnnotations();
    if (gameState.balls + 1 >= 4) {
      await recordEvent('walk', { batterId, pitcherId });
    }
  }

  // ── Baserunner handlers ───────────────────────────────────────────────────

  async function handleStolenBase(runnerId: string, fromBase: 1 | 2 | 3) {
    const toBase = (fromBase + 1) as 2 | 3 | 4;
    await recordEvent('stolen_base', { runnerId, fromBase, toBase });
    if (toBase === 4) {
      await recordEvent('score', { scoringPlayerId: runnerId, rbis: 1 });
    }
  }

  async function handleCaughtStealing(runnerId: string, fromBase: 1 | 2 | 3) {
    const toBase = (fromBase + 1) as 2 | 3 | 4;
    await recordEvent('caught_stealing', { runnerId, fromBase, toBase });
  }

  function handleAdvanceClick(runnerId: string, fromBase: 1 | 2 | 3, toBase: 2 | 3 | 4) {
    setPendingAdvance({ runnerId, fromBase, toBase });
    setAdvanceErrorBy(null);
  }

  async function handleRunnerAdvance(runnerId: string, fromBase: 1 | 2 | 3, toBase: 2 | 3 | 4, reason?: string, errorBy?: number | null) {
    const payload: Record<string, unknown> = { runnerId, fromBase, toBase };
    if (reason) payload.reason = reason;
    if (errorBy != null) payload.errorBy = errorBy;
    await recordEvent('baserunner_advance', payload);
    if (toBase === 4) {
      await recordEvent('score', { scoringPlayerId: runnerId, rbis: 1 });
    }
    setPendingAdvance(null);
    setAdvanceErrorBy(null);
  }

  async function handleBalk() {
    const balkPitcherId = gameState.currentPitcherId ?? 'unknown-pitcher';
    await recordEvent('balk', { pitcherId: balkPitcherId });
    // Runs scored on balks are not RBIs per official scoring rules
    const thirdRunner = gameState.runnersOnBase.third;
    if (thirdRunner) {
      await recordEvent('score', { scoringPlayerId: thirdRunner, rbis: 0 });
    }
  }

  async function handleRundown() {
    if (!rundownRunnerId || !rundownOutcome) return;
    if (rundownOutcome === 'safe' && !rundownSafeBase) return;
    const startBase = (
      gameState.runnersOnBase.first  === rundownRunnerId ? 1 :
      gameState.runnersOnBase.second === rundownRunnerId ? 2 :
      gameState.runnersOnBase.third  === rundownRunnerId ? 3 :
      null
    );
    if (!startBase) return;
    await recordEvent('rundown', {
      runnerId: rundownRunnerId,
      startBase,
      outcome: rundownOutcome,
      safeAtBase: rundownOutcome === 'safe' ? rundownSafeBase : undefined,
      throwSequence: rundownThrowSeq,
    });
    setShowRundown(false);
    setRundownRunnerId('');
    setRundownThrowSeq([]);
    setRundownOutcome(null);
    setRundownSafeBase(null);
  }

  async function handleSubstitution() {
    if (!subOutPlayerId || !subInPlayerId || !subType) return;
    const isOpponent = subTeam === 'opponent';
    const payload: Record<string, unknown> = {
      inPlayerId: subInPlayerId,
      outPlayerId: subOutPlayerId,
      substitutionType: subType,
      isOpponentSubstitution: isOpponent,
    };
    if (subType === 'pinch_runner' && subRunnerBase != null) payload.runnerBase = subRunnerBase;
    if (subType === 'defensive' && subNewPosition) payload.newPosition = subNewPosition;
    await recordEvent('substitution', payload);
    setShowSubstitution(false);
    setSubType(null);
    setSubOutPlayerId('');
    setSubInPlayerId('');
    setSubRunnerBase(null);
    setSubNewPosition('');
  }

  async function handleInningChange() {
    await recordEvent('inning_change', {});
  }

  async function handlePitchingChange(newPitcherId: string) {
    const outgoingPitcherId = gameState.currentPitcherId ?? '';
    await recordEvent('pitching_change', { newPitcherId, outgoingPitcherId });
    setShowPitchingChange(false);
  }

  // Pitch outcome buttons are enabled once all enabled annotations are filled in
  const pitchAnnotationsReady =
    (!localConfig.pitchType     || pitchType    !== null) &&
    (!localConfig.pitchLocation || zoneLocation !== null);

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
        <div className="flex items-center gap-2">
          {isCoach && (
            <button
              onClick={() => setShowSettings((s) => !s)}
              title="Scoring options"
              className={`p-1.5 rounded-lg transition-colors ${
                showSettings
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              {/* Gear icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .205 1.251l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.205-1.251l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
              </svg>
            </button>
          )}
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
      </div>

      {/* ── Settings panel ──────────────────────────────────── */}
      {showSettings && isCoach && (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-lg mx-auto space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Scoring options
            </p>
            <ConfigToggle
              id="cfg-pitch-type"
              checked={localConfig.pitchType}
              onChange={(v) => setLocalConfig((c) => ({ ...c, pitchType: v }))}
              label="Track pitch type"
            />
            <ConfigToggle
              id="cfg-pitch-location"
              checked={localConfig.pitchLocation}
              onChange={(v) => setLocalConfig((c) => ({ ...c, pitchLocation: v }))}
              label="Track pitch location"
            />
            <ConfigToggle
              id="cfg-spray-chart"
              checked={localConfig.sprayChart}
              onChange={(v) => setLocalConfig((c) => ({ ...c, sprayChart: v }))}
              label="Batter spray chart"
            />
          </div>
        </div>
      )}

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
          <BaserunnerDiamond runners={gameState.runnersOnBase} labels={runnerLabels} />
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Batting</p>
              <p className="font-semibold text-gray-900">
                {activeBatter
                  ? `${activeBatter.player.lastName} #${activeBatter.player.jerseyNumber ?? '—'}`
                  : '—'}
              </p>
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

        {/* ── Pitch Controls (coaches only) ─────────────────────── */}
        {isCoach && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

            {/* Pitch type + zone selectors — conditionally shown based on scoring config */}
            {gameState.outs < 3 && (localConfig.pitchType || localConfig.pitchLocation || localConfig.sprayChart) && (
              <div className="space-y-3 pb-3 border-b border-gray-100">
                {localConfig.pitchType && (
                  <PitchTypeSelector selected={pitchType} onSelect={setPitchType} />
                )}
                {(localConfig.pitchLocation || (localConfig.sprayChart && !isOpponentBatting && currentBatter)) && (
                  <div className="flex gap-3 items-start">
                    {localConfig.pitchLocation && (
                      <div className="shrink-0">
                        <StrikeZoneGrid selected={zoneLocation} onSelect={setZoneLocation} />
                      </div>
                    )}
                    {localConfig.sprayChart && !isOpponentBatting && currentBatter && (
                      <BatterSprayChart
                        allHitPoints={tendencyHitPointsWithCount}
                        currentBalls={gameState.balls}
                        currentStrikes={gameState.strikes}
                      />
                    )}
                  </div>
                )}
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

                {fieldingSequencePending && stashedOutResult ? (
                  /* ── Step 3: Fielding sequence picker (for outs) ── */
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Fielding play order (up to 5)
                    </p>
                    {fieldingSequence.length > 0 && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-bold text-gray-900 tracking-wider">
                          {formatFieldingSequence(fieldingSequence)}
                        </span>
                        <button
                          onClick={() => setFieldingSequence((prev) => prev.slice(0, -1))}
                          className="text-xs text-gray-400 hover:text-gray-600 underline"
                        >
                          Undo
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {FIELDING_POSITION_NUMBERS.map(({ number, abbr }) => (
                        <button
                          key={number}
                          onClick={() => {
                            if (fieldingSequence.length < 5) {
                              setFieldingSequence((prev) => [...prev, number]);
                            }
                          }}
                          disabled={fieldingSequence.length >= 5}
                          className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {number} — {abbr}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={() => {
                          handleInPlay(stashedOutResult, pendingTrajectory ?? 'ground_ball', fieldingSequence);
                        }}
                        disabled={fieldingSequence.length === 0}
                        className="flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-brand-700 text-white hover:bg-brand-800 disabled:hover:bg-brand-700"
                      >
                        Record Out{fieldingSequence.length > 0 ? ` (${formatFieldingSequence(fieldingSequence)})` : ''}
                      </button>
                      <button
                        onClick={() => {
                          handleInPlay(stashedOutResult, pendingTrajectory ?? 'ground_ball');
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        Skip
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setFieldingSequencePending(false);
                        setFieldingSequence([]);
                        setPendingTrajectory(null);
                        setPendingResult(stashedOutResult);
                        setStashedOutResult(null);
                      }}
                      className="text-xs text-gray-400 hover:text-gray-600 mt-2 block"
                    >
                      ← Back to trajectory
                    </button>
                  </div>
                ) : errorPending ? (
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
                      onClick={() => { setErrorPending(false); setPendingTrajectory(null); setPendingResult('error'); }}
                      className="text-xs text-gray-400 hover:text-gray-600 mt-2 block"
                    >
                      ← Back to trajectory
                    </button>
                  </div>
                ) : pendingResult !== null ? (
                  /* ── Step 2: Trajectory picker ── */
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      How was it hit?
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Ground Ball', value: 'ground_ball' },
                        { label: 'Line Drive',  value: 'line_drive' },
                        { label: 'Fly Ball',    value: 'fly_ball' },
                      ].map(({ label, value }) => (
                        <button
                          key={value}
                          onClick={() => {
                            if (pendingResult === 'error') {
                              setPendingTrajectory(value);
                              setErrorPending(true);
                              setPendingResult(null);
                            } else if (pendingResult === 'out' || pendingResult === 'field_choice') {
                              setStashedOutResult(pendingResult);
                              setPendingTrajectory(value);
                              setPendingResult(null);
                              setFieldingSequencePending(true);
                              setFieldingSequence([]);
                            } else {
                              handleInPlay(pendingResult, value);
                            }
                          }}
                          className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setPendingResult(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 mt-2 block"
                    >
                      ← Back to result
                    </button>
                  </div>
                ) : (
                  /* ── Step 1: Result buttons ── */
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      In play — what happened?
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['single', 'double', 'triple', 'home_run', 'out', 'field_choice'] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setPendingResult(r)}
                          disabled={!sprayPoint}
                          className="py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:hover:bg-gray-50 capitalize"
                        >
                          {r === 'home_run' ? 'HR' : r === 'field_choice' ? 'FC' : r.charAt(0).toUpperCase() + r.slice(1)}
                        </button>
                      ))}
                      <button
                        onClick={() => setPendingResult('error')}
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
                  onClick={() => { setInPlayPending(false); resetAnnotations(); }}
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
                    <p className="text-xs text-gray-400 mt-2">
                      Select{' '}
                      {[
                        localConfig.pitchType && !pitchType && 'pitch type',
                        localConfig.pitchLocation && zoneLocation === null && 'location',
                      ]
                        .filter(Boolean)
                        .join(' and ')}{' '}
                      above to enable
                    </p>
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

        {/* ── Baserunning ─────────────────────────────────────────── */}
        {isCoach && !inPlayPending && Object.values(gameState.runnersOnBase).some(Boolean) && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Baserunning</p>
            <div className="space-y-2">
              {(
                [
                  { base: 3 as const, label: '3rd', runnerId: gameState.runnersOnBase.third },
                  { base: 2 as const, label: '2nd', runnerId: gameState.runnersOnBase.second },
                  { base: 1 as const, label: '1st', runnerId: gameState.runnersOnBase.first },
                ] as const
              ).filter((b) => b.runnerId).map(({ base, label, runnerId }) => {
                const nextBase = (base + 1) as 2 | 3 | 4;
                const stealLabel = ({ 2: 'Steal 2nd', 3: 'Steal 3rd', 4: 'Steal Home' } as Record<number, string>)[nextBase];
                const isPendingThis = pendingAdvance?.runnerId === runnerId;
                return (
                  <div key={base}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-gray-500 w-7">{label}</span>
                      <span className="text-xs font-medium text-gray-800 flex-1 min-w-0 truncate">
                        {playerName(runnerId!)}
                      </span>
                      <button
                        onClick={() => handleStolenBase(runnerId!, base)}
                        className="px-2 py-1 text-xs font-medium rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors whitespace-nowrap"
                      >
                        {stealLabel}
                      </button>
                      <button
                        onClick={() => handleCaughtStealing(runnerId!, base)}
                        className="px-2 py-1 text-xs font-medium rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                      >
                        CS
                      </button>
                      {base < 3 && (
                        <button
                          onClick={() => handleAdvanceClick(runnerId!, base, (base + 1) as 2 | 3)}
                          className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${isPendingThis && pendingAdvance?.toBase === base + 1 ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                        >
                          Adv →
                        </button>
                      )}
                      <button
                        onClick={() => handleAdvanceClick(runnerId!, base, 4)}
                        className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${isPendingThis && pendingAdvance?.toBase === 4 ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                      >
                        Score
                      </button>
                    </div>

                    {/* Advance reason picker — shown inline when this runner has a pending advance */}
                    {isPendingThis && pendingAdvance && (
                      <div className="mt-2 ml-7 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Reason for advance</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {([
                            { label: 'Overthrow',  value: 'overthrow' },
                            { label: 'Error',      value: 'error' },
                            { label: 'Wild Pitch', value: 'wild_pitch' },
                            { label: 'Passed Ball',value: 'passed_ball' },
                            { label: 'Balk',       value: 'balk' },
                            { label: 'Voluntary',  value: 'voluntary' },
                          ] as const).map(({ label, value }) => (
                            <button
                              key={value}
                              onClick={() => handleRunnerAdvance(pendingAdvance.runnerId, pendingAdvance.fromBase, pendingAdvance.toBase, value, advanceErrorBy)}
                              className="px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:border-brand-400 hover:text-brand-700 transition-colors"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {/* Fielder selector for overthrow/error */}
                        <div className="mb-2">
                          <p className="text-[10px] text-gray-400 mb-1">Fielder (for OT/Error)</p>
                          <div className="flex flex-wrap gap-1">
                            {[
                              { n: 1, label: 'P' }, { n: 2, label: 'C' }, { n: 3, label: '1B' },
                              { n: 4, label: '2B' }, { n: 5, label: '3B' }, { n: 6, label: 'SS' },
                              { n: 7, label: 'LF' }, { n: 8, label: 'CF' }, { n: 9, label: 'RF' },
                            ].map(({ n, label }) => (
                              <button
                                key={n}
                                onClick={() => setAdvanceErrorBy(advanceErrorBy === n ? null : n)}
                                className={`px-2 py-0.5 text-xs rounded border transition-colors ${advanceErrorBy === n ? 'bg-brand-600 text-white border-brand-700' : 'bg-white border-gray-300 text-gray-600 hover:border-brand-400'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => { setPendingAdvance(null); setAdvanceErrorBy(null); }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Rundown button */}
            {!showRundown && (
              <button
                onClick={() => setShowRundown(true)}
                className="mt-3 text-xs text-gray-400 hover:text-gray-600"
              >
                Rundown…
              </button>
            )}

            {/* Rundown panel */}
            {showRundown && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <p className="text-xs font-semibold text-gray-600">Rundown</p>

                {/* Runner selector */}
                <div>
                  <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Runner</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {(
                      [
                        { base: 1 as const, id: gameState.runnersOnBase.first },
                        { base: 2 as const, id: gameState.runnersOnBase.second },
                        { base: 3 as const, id: gameState.runnersOnBase.third },
                      ]
                    ).filter((b) => b.id).map(({ base, id }) => (
                      <button
                        key={base}
                        onClick={() => setRundownRunnerId(id!)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors ${rundownRunnerId === id ? 'bg-brand-600 text-white border-brand-700' : 'bg-white border-gray-300 text-gray-700 hover:border-brand-400'}`}
                      >
                        {playerName(id!)} ({base === 1 ? '1st' : base === 2 ? '2nd' : '3rd'})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Throw sequence builder */}
                <div>
                  <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">
                    Throw sequence{rundownThrowSeq.length > 0 && `: ${rundownThrowSeq.map((n) => ['P','C','1B','2B','3B','SS','LF','CF','RF'][n - 1]).join(' → ')}`}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {[
                      { n: 1, label: 'P' }, { n: 2, label: 'C' }, { n: 3, label: '1B' },
                      { n: 4, label: '2B' }, { n: 5, label: '3B' }, { n: 6, label: 'SS' },
                      { n: 7, label: 'LF' }, { n: 8, label: 'CF' }, { n: 9, label: 'RF' },
                    ].map(({ n, label }) => (
                      <button
                        key={n}
                        onClick={() => setRundownThrowSeq((s) => [...s, n])}
                        className="px-2 py-0.5 text-xs rounded border bg-white border-gray-300 text-gray-700 hover:border-brand-400 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                    {rundownThrowSeq.length > 0 && (
                      <button
                        onClick={() => setRundownThrowSeq((s) => s.slice(0, -1))}
                        className="px-2 py-0.5 text-xs rounded border bg-red-50 border-red-200 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        ← Undo
                      </button>
                    )}
                  </div>
                </div>

                {/* Outcome */}
                <div>
                  <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Outcome</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setRundownOutcome('out'); setRundownSafeBase(null); }}
                      className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${rundownOutcome === 'out' ? 'bg-red-600 text-white border-red-700' : 'bg-white border-gray-300 text-gray-700 hover:border-red-400'}`}
                    >
                      Out
                    </button>
                    <button
                      onClick={() => setRundownOutcome('safe')}
                      className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${rundownOutcome === 'safe' ? 'bg-green-600 text-white border-green-700' : 'bg-white border-gray-300 text-gray-700 hover:border-green-400'}`}
                    >
                      Safe
                    </button>
                  </div>
                </div>

                {/* Safe at base */}
                {rundownOutcome === 'safe' && (
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Safe at</p>
                    <div className="flex gap-1.5">
                      {([1, 2, 3] as const).map((b) => (
                        <button
                          key={b}
                          onClick={() => setRundownSafeBase(b)}
                          className={`px-2.5 py-1 text-xs rounded border transition-colors ${rundownSafeBase === b ? 'bg-brand-600 text-white border-brand-700' : 'bg-white border-gray-300 text-gray-700 hover:border-brand-400'}`}
                        >
                          {b === 1 ? '1st' : b === 2 ? '2nd' : '3rd'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleRundown}
                    disabled={!rundownRunnerId || !rundownOutcome || (rundownOutcome === 'safe' && !rundownSafeBase)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Record Rundown
                  </button>
                  <button
                    onClick={() => { setShowRundown(false); setRundownRunnerId(''); setRundownThrowSeq([]); setRundownOutcome(null); setRundownSafeBase(null); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
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
              {(teamRoster ?? lineup.map((lineupEntry) => lineupEntry.player))
                .filter((pitcher): pitcher is typeof pitcher & { id: string } => pitcher.id !== null && pitcher.id !== gameState.currentPitcherId)
                .map((pitcher) => (
                  <button
                    key={pitcher.id}
                    onClick={() => handlePitchingChange(pitcher.id)}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {pitcher.lastName}, {pitcher.firstName}
                    {pitcher.jerseyNumber != null && (
                      <span className="text-gray-400 ml-1">#{pitcher.jerseyNumber}</span>
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

        {/* ── Balk ──────────────────────────────────────────────────── */}
        {isCoach && (
          <button
            onClick={handleBalk}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            Balk
          </button>
        )}

        {/* ── Substitution ───────────────────────────────────────────── */}
        {isCoach && !showSubstitution && (
          <button
            onClick={() => { setShowSubstitution(true); setSubType(null); setSubOutPlayerId(''); setSubInPlayerId(''); setSubRunnerBase(null); setSubNewPosition(''); }}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            Substitution…
          </button>
        )}
        {isCoach && showSubstitution && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Substitution</p>

            {/* Team selector */}
            <div className="flex gap-2">
              {(['us', 'opponent'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setSubTeam(t); setSubOutPlayerId(''); setSubInPlayerId(''); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${subTeam === t ? 'bg-brand-600 text-white border-brand-700' : 'border-gray-300 text-gray-600 bg-white hover:border-brand-400'}`}
                >
                  {t === 'us' ? 'Our Team' : 'Opponent'}
                </button>
              ))}
            </div>

            {/* Substitution type */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Type</p>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: 'pinch_hitter', label: 'Pinch Hitter' },
                  { value: 'pinch_runner', label: 'Pinch Runner' },
                  { value: 'defensive',   label: 'Defensive' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setSubType(value)}
                    className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${subType === value ? 'bg-brand-600 text-white border-brand-700' : 'bg-white border-gray-300 text-gray-600 hover:border-brand-400'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {subType && (() => {
              const isOpp = subTeam === 'opponent';
              const currentRoster: { id: string; firstName: string; lastName: string; jerseyNumber: number | string | null }[] =
                isOpp
                  ? (opponentRoster ?? [])
                  : (teamRoster ?? lineup.map((l) => l.player).filter((p): p is typeof p & { id: string } => p.id !== null));
              const currentLineupIds = new Set(
                isOpp
                  ? (opponentLineup ?? []).map((l) => l.playerId)
                  : lineup.map((l) => l.playerId),
              );

              return (
                <>
                  {/* Player OUT */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Out (leaving game)</p>
                    <select
                      value={subOutPlayerId}
                      onChange={(e) => setSubOutPlayerId(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
                    >
                      <option value="">Select player…</option>
                      {currentRoster
                        .filter((p) => currentLineupIds.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.lastName}, {p.firstName}{p.jerseyNumber != null ? ` #${p.jerseyNumber}` : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Player IN */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">In (entering game)</p>
                    <select
                      value={subInPlayerId}
                      onChange={(e) => setSubInPlayerId(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
                    >
                      <option value="">Select player…</option>
                      {currentRoster
                        .filter((p) => !currentLineupIds.has(p.id) || p.id === subInPlayerId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.lastName}, {p.firstName}{p.jerseyNumber != null ? ` #${p.jerseyNumber}` : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Runner base — for pinch runner */}
                  {subType === 'pinch_runner' && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Runner placed at</p>
                      <div className="flex gap-2">
                        {([1, 2, 3] as const).map((b) => (
                          <button
                            key={b}
                            onClick={() => setSubRunnerBase(b)}
                            className={`px-3 py-1 text-xs rounded border transition-colors ${subRunnerBase === b ? 'bg-brand-600 text-white border-brand-700' : 'bg-white border-gray-300 text-gray-600 hover:border-brand-400'}`}
                          >
                            {b === 1 ? '1st' : b === 2 ? '2nd' : '3rd'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New position — for defensive sub */}
                  {subType === 'defensive' && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">New position (optional)</p>
                      <select
                        value={subNewPosition}
                        onChange={(e) => setSubNewPosition(e.target.value)}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
                      >
                        <option value="">Select…</option>
                        {['P','C','1B','2B','3B','SS','LF','CF','RF','DH'].map((pos) => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSubstitution}
                disabled={!subOutPlayerId || !subInPlayerId || !subType}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Record Substitution
              </button>
              <button
                onClick={() => setShowSubstitution(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
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
