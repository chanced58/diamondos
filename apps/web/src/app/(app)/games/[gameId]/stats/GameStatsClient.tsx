'use client';

import type { JSX, ReactNode } from 'react';
import { useState, useMemo } from 'react';
import type { BattingStats, PitchingStats } from '@baseball/shared';
import { formatBattingRate, formatBattingPct, formatInningsPitched } from '@baseball/shared';

// ── Shared types (imported by page.tsx) ─────────────────────────────────────

export type FieldingStatRow = {
  playerId: string;
  playerName: string;
  position: string;
  putouts: number;
  assists: number;
  errors: number;
};

export type LineScoreData = {
  awayRunsByInning: number[];
  homeRunsByInning: number[];
  awayRuns: number;
  homeRuns: number;
  awayHits: number;
  homeHits: number;
  awayErrors: number;
  homeErrors: number;
};

export type PlayerInfo = {
  id: string;
  name: string;
  jerseyNumber: number | string | null;
  isOpponent: boolean;
  battingOrder?: number;
  position?: string;
};

// Lightweight opponent batting row (opponentBatterId-based events)
export type OppBattingRow = {
  playerId: string;
  playerName: string;
  pa: number; ab: number; r: number; h: number; hr: number;
  rbi: number; bb: number; k: number;
  avg: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawGameEvent = Record<string, any>;

export interface GameStatsClientProps {
  game: {
    id: string;
    opponentName: string;
    locationType: string;
    status: string;
    teamName: string;
  };
  events: RawGameEvent[];
  ourBatting: BattingStats[];
  oppBatting: OppBattingRow[];
  ourPitching: PitchingStats[];
  oppPitching: PitchingStats[];
  ourFielding: FieldingStatRow[];
  lineScore: LineScoreData;
  players: PlayerInfo[]; // all players (our team + opponent)
}

// ── Display helpers ──────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const s = ['th', 'st', 'nd', 'rd'];
  return n + (s[n % 10] ?? s[0]);
}

function fmtRate(v: number): string {
  return formatBattingRate(v);
}

function fmtPct(v: number): string {
  return formatBattingPct(v);
}

function fmtEra(v: number): string {
  if (!isFinite(v)) return '---';
  return v.toFixed(2);
}

function fmtWhip(v: number): string {
  if (!isFinite(v)) return '---';
  return v.toFixed(2);
}

function fmtPer7(v: number): string {
  if (!isFinite(v) || isNaN(v)) return '---';
  return v.toFixed(1);
}

function outcomeLabel(outcome: string): string {
  const map: Record<string, string> = {
    called_strike: 'Called Strike', swinging_strike: 'Swinging Strike',
    foul_tip: 'Foul Tip', foul: 'Foul', ball: 'Ball',
    intentional_ball: 'Int. Ball', hit_by_pitch: 'HBP', in_play: 'In Play',
  };
  return map[outcome] ?? outcome;
}

function resultLabel(etype: string, payload: Record<string, unknown>): string {
  if (etype === 'hit') {
    const type = payload.hitType as string;
    const map: Record<string, string> = {
      single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home Run',
    };
    return map[type] ?? 'Hit';
  }
  const map: Record<string, string> = {
    out: 'Out', strikeout: 'Strikeout', walk: 'Walk', hit_by_pitch: 'HBP',
    sacrifice_fly: 'Sac Fly', sacrifice_bunt: 'Sac Bunt', field_error: 'Reach on Error',
    double_play: 'Double Play', triple_play: 'Triple Play',
  };
  return map[etype] ?? etype;
}

function resultColor(etype: string): string {
  if (etype === 'hit' || etype === 'walk' || etype === 'hit_by_pitch' || etype === 'field_error') {
    return 'text-green-700 bg-green-50';
  }
  if (etype === 'strikeout') return 'text-red-700 bg-red-50';
  if (etype === 'double_play' || etype === 'triple_play') return 'text-orange-700 bg-orange-50';
  return 'text-gray-700 bg-gray-100';
}

// ── Play-by-Play builder ─────────────────────────────────────────────────────

type PbpPitch = {
  outcome: string;
  pitchType?: string;
  countBefore: string;
  countAfter: string;
  isWildPitch?: boolean;
  isPassedBall?: boolean;
};

type PbpAtBat = {
  key: string;
  batterName: string;
  pitcherName: string;
  pitches: PbpPitch[];
  result: string;
  resultLabel: string;
  rbis: number;
  sidelineEvents: string[]; // SBs, substitutions, etc. logged against this AB
};

type PbpHalfInning = {
  key: string;
  inning: number;
  isTop: boolean;
  label: string;
  atBats: PbpAtBat[];
  runs: number;
};

function buildPlayByPlay(
  events: RawGameEvent[],
  nameMap: Map<string, string>,
): PbpHalfInning[] {
  const halfInnings: PbpHalfInning[] = [];
  let currentHalf: PbpHalfInning | null = null;
  let currentAB: PbpAtBat | null = null;
  let currentBatterId: string | null = null;
  let balls = 0, strikes = 0;
  let abCounter = 0;

  function pushAB() {
    if (currentAB && currentHalf) {
      currentHalf.atBats.push(currentAB);
    }
    currentAB = null;
    currentBatterId = null;
    balls = 0; strikes = 0;
  }

  function ensureHalf(inning: number, isTop: boolean) {
    if (!currentHalf || currentHalf.inning !== inning || currentHalf.isTop !== isTop) {
      pushAB();
      if (currentHalf) halfInnings.push(currentHalf);
      currentHalf = {
        key: `${inning}-${isTop ? 'T' : 'B'}`,
        inning, isTop,
        label: `${ordinal(inning)} — ${isTop ? 'Top' : 'Bottom'}`,
        atBats: [], runs: 0,
      };
    }
  }

  for (const event of events) {
    const etype = event.event_type as string;
    const inning = event.inning as number ?? 1;
    const isTop = (event.is_top_of_inning as boolean) ?? true;
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    if (!inning) continue;
    ensureHalf(inning, isTop);

    if (etype === 'pitch_thrown') {
      const batterId = ((payload.batterId ?? payload.opponentBatterId) as string | undefined) ?? null;
      const pitcherId = ((payload.pitcherId ?? payload.opponentPitcherId) as string | undefined) ?? null;
      const outcome = payload.outcome as string;

      if (batterId && batterId !== currentBatterId) {
        pushAB();
        currentBatterId = batterId;
        abCounter++;
        currentAB = {
          key: `ab-${abCounter}`,
          batterName: batterId ? (nameMap.get(batterId) ?? 'Unknown') : 'Unknown',
          pitcherName: pitcherId ? (nameMap.get(pitcherId) ?? 'Unknown') : 'Unknown',
          pitches: [], result: '', resultLabel: '', rbis: 0, sidelineEvents: [],
        };
        balls = 0; strikes = 0;
      }

      if (!currentAB) continue;

      const countBefore = `${balls}-${strikes}`;
      if (outcome === 'called_strike' || outcome === 'swinging_strike' || outcome === 'foul_tip') {
        if (strikes < 2) strikes++;
      } else if (outcome === 'foul') {
        if (strikes < 2) strikes++;
      } else if (outcome === 'ball' || outcome === 'intentional_ball') {
        balls++;
      }
      const countAfter = (outcome === 'in_play' || outcome === 'hit_by_pitch')
        ? countBefore
        : `${balls}-${strikes}`;

      currentAB.pitches.push({
        outcome,
        pitchType: payload.pitchType as string | undefined,
        countBefore,
        countAfter,
        isWildPitch: payload.isWildPitch as boolean | undefined,
        isPassedBall: payload.isPassedBall as boolean | undefined,
      });
    } else if (
      etype === 'hit' || etype === 'out' || etype === 'walk' || etype === 'strikeout' ||
      etype === 'hit_by_pitch' || etype === 'sacrifice_fly' || etype === 'sacrifice_bunt' ||
      etype === 'field_error' || etype === 'double_play' || etype === 'triple_play'
    ) {
      if (currentAB) {
        currentAB.result = etype;
        currentAB.resultLabel = resultLabel(etype, payload);
        currentAB.rbis = (payload.rbis as number) ?? 0;
      }
      pushAB();
    } else if (etype === 'score' && currentHalf) {
      currentHalf.runs += (payload.rbis as number) ?? 1;
    } else if (etype === 'stolen_base') {
      const runnerId = payload.runnerId as string | undefined;
      const name = runnerId ? (nameMap.get(runnerId) ?? 'Runner') : 'Runner';
      const to = payload.toBase as number ?? 2;
      const note = `SB: ${name} stole ${ordinal(to)} base`;
      if (currentAB) currentAB.sidelineEvents.push(note);
      else if (currentHalf && currentHalf.atBats.length > 0) {
        currentHalf.atBats[currentHalf.atBats.length - 1].sidelineEvents.push(note);
      }
    } else if (etype === 'caught_stealing') {
      const runnerId = payload.runnerId as string | undefined;
      const name = runnerId ? (nameMap.get(runnerId) ?? 'Runner') : 'Runner';
      const note = `CS: ${name} caught stealing`;
      if (currentAB) currentAB.sidelineEvents.push(note);
      else if (currentHalf && currentHalf.atBats.length > 0) {
        currentHalf.atBats[currentHalf.atBats.length - 1].sidelineEvents.push(note);
      }
    } else if (etype === 'pitching_change') {
      const newId = payload.newPitcherId as string | undefined;
      const name = newId ? (nameMap.get(newId) ?? 'Unknown') : 'Unknown';
      const note = `Pitching change: ${name}`;
      if (currentAB) currentAB.sidelineEvents.push(note);
      else if (currentHalf && currentHalf.atBats.length > 0) {
        currentHalf.atBats[currentHalf.atBats.length - 1].sidelineEvents.push(note);
      }
    } else if (etype === 'substitution') {
      const inId = payload.inPlayerId as string | undefined;
      const outId = payload.outPlayerId as string | undefined;
      const subType = payload.substitutionType as string | undefined;
      const inName = inId ? (nameMap.get(inId) ?? 'Unknown') : 'Unknown';
      const outName = outId ? (nameMap.get(outId) ?? 'Unknown') : 'Unknown';
      let note = `Sub: ${outName} → ${inName}`;
      if (subType === 'position_change') note = `Position change: ${inName}`;
      if (currentAB) currentAB.sidelineEvents.push(note);
      else if (currentHalf && currentHalf.atBats.length > 0) {
        currentHalf.atBats[currentHalf.atBats.length - 1].sidelineEvents.push(note);
      }
    }
  }

  pushAB();
  if (currentHalf) halfInnings.push(currentHalf);
  return halfInnings;
}

// ── Tab helpers ──────────────────────────────────────────────────────────────

type Tab = 'box_score' | 'batting' | 'pitching' | 'fielding' | 'play_by_play';

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LineScoreTable({
  lineScore,
  usLabel,
  oppLabel,
  weAreHome,
}: {
  lineScore: LineScoreData;
  usLabel: string;
  oppLabel: string;
  weAreHome: boolean;
}) {
  const maxInnings = Math.max(lineScore.awayRunsByInning.length, lineScore.homeRunsByInning.length, 9);
  const inningNums = Array.from({ length: maxInnings }, (_, i) => i + 1);

  // away = top half batting; home = bottom half batting
  // if we're home: our runs are homeRunsByInning, opponent's are awayRunsByInning
  const ourRunsByInning  = weAreHome ? lineScore.homeRunsByInning : lineScore.awayRunsByInning;
  const oppRunsByInning  = weAreHome ? lineScore.awayRunsByInning : lineScore.homeRunsByInning;
  const ourTotalRuns  = weAreHome ? lineScore.homeRuns : lineScore.awayRuns;
  const oppTotalRuns  = weAreHome ? lineScore.awayRuns : lineScore.homeRuns;
  const ourHits  = weAreHome ? lineScore.homeHits : lineScore.awayHits;
  const oppHits  = weAreHome ? lineScore.awayHits : lineScore.homeHits;
  const ourErrors  = weAreHome ? lineScore.homeErrors : lineScore.awayErrors;
  const oppErrors  = weAreHome ? lineScore.awayErrors : lineScore.homeErrors;

  const cellBase = 'text-center text-sm font-mono px-2 py-2 border-l border-gray-200';
  const labelCell = 'text-sm font-semibold text-gray-700 px-3 py-2 w-28 truncate';
  const summaryCell = `${cellBase} font-bold`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className={`${labelCell} text-left`} />
            {inningNums.map((n) => (
              <th key={n} className={`${cellBase} text-xs text-gray-500 font-semibold`}>{n}</th>
            ))}
            <th className={`${summaryCell} text-xs text-gray-700`}>R</th>
            <th className={`${summaryCell} text-xs text-gray-700`}>H</th>
            <th className={`${summaryCell} text-xs text-gray-700`}>E</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr className="bg-white">
            <td className={labelCell}>{oppLabel}</td>
            {inningNums.map((_, i) => (
              <td key={i} className={cellBase}>{oppRunsByInning[i] ?? '·'}</td>
            ))}
            <td className={summaryCell}>{oppTotalRuns}</td>
            <td className={summaryCell}>{oppHits}</td>
            <td className={summaryCell}>{oppErrors}</td>
          </tr>
          <tr className="bg-white">
            <td className={labelCell}>{usLabel}</td>
            {inningNums.map((_, i) => (
              <td key={i} className={cellBase}>{ourRunsByInning[i] ?? '·'}</td>
            ))}
            <td className={summaryCell}>{ourTotalRuns}</td>
            <td className={summaryCell}>{ourHits}</td>
            <td className={summaryCell}>{ourErrors}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function BattingTable({
  rows,
  advanced,
}: {
  rows: BattingStats[];
  advanced: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.plateAppearances - a.plateAppearances);

  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 px-5 py-4">No batting data available.</p>;
  }

  if (!advanced) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Player', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'HBP', 'AVG'].map((h) => (
                <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Player' ? 'text-left' : 'text-center'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((s) => (
              <tr key={s.playerId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
                <td className="px-3 py-2 text-center">{s.atBats}</td>
                <td className="px-3 py-2 text-center">{s.runs}</td>
                <td className="px-3 py-2 text-center">{s.hits}</td>
                <td className="px-3 py-2 text-center">{s.doubles}</td>
                <td className="px-3 py-2 text-center">{s.triples}</td>
                <td className="px-3 py-2 text-center">{s.homeRuns}</td>
                <td className="px-3 py-2 text-center">{s.rbi}</td>
                <td className="px-3 py-2 text-center">{s.walks}</td>
                <td className="px-3 py-2 text-center">{s.strikeouts}</td>
                <td className="px-3 py-2 text-center">{s.hitByPitch}</td>
                <td className="px-3 py-2 text-center font-mono">{fmtRate(s.avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Player', 'PA', 'OBP', 'SLG', 'OPS', 'ISO', 'BABIP', 'K%', 'BB%', 'wOBA', 'HH%'].map((h) => (
              <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Player' ? 'text-left' : 'text-center'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              <td className="px-3 py-2 text-center">{s.plateAppearances}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtRate(s.obp)}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtRate(s.slg)}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtRate(s.ops)}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtRate(s.iso)}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtRate(s.babip)}</td>
              <td className="px-3 py-2 text-center">{fmtPct(s.kPct)}</td>
              <td className="px-3 py-2 text-center">{fmtPct(s.bbPct)}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtRate(s.woba)}</td>
              <td className="px-3 py-2 text-center">{fmtPct(s.hardHitPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OppBattingTable({ rows }: { rows: OppBattingRow[] }) {
  const sorted = [...rows].sort((a, b) => b.pa - a.pa);
  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 px-5 py-4">No batting data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Player', 'AB', 'R', 'H', 'HR', 'RBI', 'BB', 'K', 'AVG'].map((h) => (
              <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Player' ? 'text-left' : 'text-center'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              <td className="px-3 py-2 text-center">{s.ab}</td>
              <td className="px-3 py-2 text-center">{s.r}</td>
              <td className="px-3 py-2 text-center">{s.h}</td>
              <td className="px-3 py-2 text-center">{s.hr}</td>
              <td className="px-3 py-2 text-center">{s.rbi}</td>
              <td className="px-3 py-2 text-center">{s.bb}</td>
              <td className="px-3 py-2 text-center">{s.k}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtRate(s.avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitchingTable({
  rows,
  advanced,
}: {
  rows: PitchingStats[];
  advanced: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);

  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 px-5 py-4">No pitching data available.</p>;
  }

  if (!advanced) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Pitcher', 'IP', 'H', 'R', 'BB', 'K', 'HBP', 'WP', 'PC', 'Strike%', 'ERA', 'WHIP'].map((h) => (
                <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Pitcher' ? 'text-left' : 'text-center'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((s) => (
              <tr key={s.playerId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
                <td className="px-3 py-2 text-center font-mono">{formatInningsPitched(s.inningsPitchedOuts)}</td>
                <td className="px-3 py-2 text-center">{s.hitsAllowed}</td>
                <td className="px-3 py-2 text-center">{s.runsAllowed}</td>
                <td className="px-3 py-2 text-center">{s.walksAllowed}</td>
                <td className="px-3 py-2 text-center">{s.strikeouts}</td>
                <td className="px-3 py-2 text-center">{s.hitBatters}</td>
                <td className="px-3 py-2 text-center">{s.wildPitches}</td>
                <td className="px-3 py-2 text-center">{s.totalPitches}</td>
                <td className="px-3 py-2 text-center">{fmtPct(s.strikePercentage)}</td>
                <td className="px-3 py-2 text-center font-mono">{fmtEra(s.era)}</td>
                <td className="px-3 py-2 text-center font-mono">{fmtWhip(s.whip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Pitcher', 'K/7', 'BB/7', 'FPS%', '3-Ball%', 'ERA', 'WHIP'].map((h) => (
              <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Pitcher' ? 'text-left' : 'text-center'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              <td className="px-3 py-2 text-center">{fmtPer7(s.strikeoutsPerSeven)}</td>
              <td className="px-3 py-2 text-center">{fmtPer7(s.walksPerSeven)}</td>
              <td className="px-3 py-2 text-center">{fmtPct(s.firstPitchStrikePercentage)}</td>
              <td className="px-3 py-2 text-center">{fmtPct(s.threeBallCountPercentage)}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtEra(s.era)}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtWhip(s.whip)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldingTable({ rows }: { rows: FieldingStatRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 px-5 py-4">No fielding data available.</p>;
  }
  const sorted = [...rows].sort((a, b) => (b.putouts + b.assists) - (a.putouts + a.assists));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Player', 'Pos', 'PO', 'A', 'E', 'TC', 'FPCT'].map((h) => (
              <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Player' ? 'text-left' : 'text-center'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => {
            const tc = s.putouts + s.assists + s.errors;
            const fpct = tc > 0 ? (s.putouts + s.assists) / tc : NaN;
            return (
              <tr key={s.playerId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
                <td className="px-3 py-2 text-center text-gray-500">{s.position || '—'}</td>
                <td className="px-3 py-2 text-center">{s.putouts}</td>
                <td className="px-3 py-2 text-center">{s.assists}</td>
                <td className={`px-3 py-2 text-center ${s.errors > 0 ? 'text-red-600 font-semibold' : ''}`}>{s.errors}</td>
                <td className="px-3 py-2 text-center">{tc}</td>
                <td className="px-3 py-2 text-center font-mono">{isNaN(fpct) ? '---' : fpct.toFixed(3).replace(/^0(?=\.)/, '')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayByPlayView({
  halfInnings,
}: {
  halfInnings: PbpHalfInning[];
}) {
  const [openHalves, setOpenHalves] = useState<Set<string>>(new Set());
  const [openABs, setOpenABs] = useState<Set<string>>(new Set());

  function toggleHalf(key: string) {
    setOpenHalves((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAB(key: string) {
    setOpenABs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (halfInnings.length === 0) {
    return <p className="text-sm text-gray-400 p-4">No play-by-play data available.</p>;
  }

  return (
    <div className="space-y-1 p-3">
      {halfInnings.map((half) => {
        const halfOpen = openHalves.has(half.key);
        return (
          <div key={half.key} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleHalf(half.key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-800">{half.label}</span>
                {half.runs > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                    {half.runs} {half.runs === 1 ? 'run' : 'runs'}
                  </span>
                )}
                <span className="text-xs text-gray-400">{half.atBats.length} AB</span>
              </div>
              <span className="text-gray-400 text-xs">{halfOpen ? '▲' : '▼'}</span>
            </button>

            {halfOpen && (
              <div className="divide-y divide-gray-100 bg-white">
                {half.atBats.map((ab) => {
                  const abOpen = openABs.has(ab.key);
                  return (
                    <div key={ab.key}>
                      <button
                        onClick={() => toggleAB(ab.key)}
                        className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-gray-800 truncate">{ab.batterName}</span>
                          {ab.pitches.length > 0 && (
                            <span className="text-xs text-gray-400 shrink-0">{ab.pitches.length}p</span>
                          )}
                          {ab.resultLabel && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${resultColor(ab.result)}`}>
                              {ab.resultLabel}
                            </span>
                          )}
                          {ab.rbis > 0 && (
                            <span className="text-xs text-green-600 font-medium shrink-0">{ab.rbis} RBI</span>
                          )}
                        </div>
                        <span className="text-gray-400 text-xs ml-2 shrink-0">{abOpen ? '▲' : '▼'}</span>
                      </button>

                      {abOpen && (
                        <div className="px-6 pb-3 space-y-1 bg-gray-50">
                          <p className="text-xs text-gray-400 mb-2">vs {ab.pitcherName}</p>
                          {ab.pitches.map((pitch, pi) => (
                            <div key={pi} className="flex items-center gap-3 text-xs text-gray-700">
                              <span className="text-gray-400 w-4 text-right shrink-0">{pi + 1}.</span>
                              <span className="font-mono text-gray-500 w-8 shrink-0">{pitch.countBefore}</span>
                              <span className="text-gray-400 shrink-0">→</span>
                              {pitch.pitchType && (
                                <span className="text-blue-600 shrink-0">{pitch.pitchType.replace('_', ' ')}</span>
                              )}
                              <span className="font-medium">{outcomeLabel(pitch.outcome)}</span>
                              <span className="font-mono text-gray-500 shrink-0">{pitch.countAfter}</span>
                              {pitch.isWildPitch && <span className="text-orange-600 shrink-0">WP</span>}
                              {pitch.isPassedBall && <span className="text-orange-600 shrink-0">PB</span>}
                            </div>
                          ))}
                          {ab.sidelineEvents.map((note, si) => (
                            <div key={si} className="text-xs text-indigo-600 italic mt-1 pl-7">{note}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function GameStatsClient({
  game,
  events,
  ourBatting,
  oppBatting,
  ourPitching,
  oppPitching,
  ourFielding,
  lineScore,
  players,
}: GameStatsClientProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('box_score');
  const [battingTeam, setBattingTeam] = useState<'us' | 'opp'>('us');
  const [pitchingTeam, setPitchingTeam] = useState<'us' | 'opp'>('us');
  const [battingMode, setBattingMode] = useState<'standard' | 'advanced'>('standard');
  const [pitchingMode, setPitchingMode] = useState<'standard' | 'advanced'>('standard');

  const weAreHome = game.locationType === 'home';
  const ourLabel = game.teamName;
  const oppLabel = game.opponentName;

  // Build player name map for play-by-play
  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of players) m.set(p.id, p.name);
    return m;
  }, [players]);

  // Build play-by-play tree
  const playByPlay = useMemo(() => buildPlayByPlay(events, nameMap), [events, nameMap]);

  // Box score batting summary (standard cols only)
  const ourBattingSummary = [...ourBatting].sort((a, b) => b.atBats - a.atBats);
  const ourPitchingSummary = [...ourPitching].sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'box_score', label: 'Box Score' },
    { id: 'batting', label: 'Batting' },
    { id: 'pitching', label: 'Pitching' },
    { id: 'fielding', label: 'Fielding' },
    { id: 'play_by_play', label: 'Play-by-Play' },
  ];

  return (
    <div className="w-full">
      {/* Tab bar */}
      <div className="border-b border-gray-200 flex overflow-x-auto">
        {tabs.map((t) => (
          <TabButton key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* ── Box Score ──────────────────────────────────────────────── */}
      {tab === 'box_score' && (
        <div className="p-4 space-y-4">
          <LineScoreTable
            lineScore={lineScore}
            usLabel={ourLabel}
            oppLabel={oppLabel}
            weAreHome={weAreHome}
          />

          {/* Batting summary */}
          <CollapsibleSection title={`Batting — ${ourLabel}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {['Player', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'AVG'].map((h) => (
                      <th key={h} className={`px-3 py-2 text-xs font-semibold text-gray-600 ${h === 'Player' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ourBattingSummary.map((s) => (
                    <tr key={s.playerId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.atBats}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.runs}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.hits}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.doubles}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.triples}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.homeRuns}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.rbi}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.walks}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.strikeouts}</td>
                      <td className="px-3 py-2 text-center text-sm font-mono">{fmtRate(s.avg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>

          {/* Pitching summary */}
          <CollapsibleSection title={`Pitching — ${ourLabel}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {['Pitcher', 'IP', 'H', 'R', 'BB', 'K', 'PC', 'ERA'].map((h) => (
                      <th key={h} className={`px-3 py-2 text-xs font-semibold text-gray-600 ${h === 'Pitcher' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ourPitchingSummary.map((s) => (
                    <tr key={s.playerId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
                      <td className="px-3 py-2 text-center font-mono">{formatInningsPitched(s.inningsPitchedOuts)}</td>
                      <td className="px-3 py-2 text-center">{s.hitsAllowed}</td>
                      <td className="px-3 py-2 text-center">{s.runsAllowed}</td>
                      <td className="px-3 py-2 text-center">{s.walksAllowed}</td>
                      <td className="px-3 py-2 text-center">{s.strikeouts}</td>
                      <td className="px-3 py-2 text-center">{s.totalPitches}</td>
                      <td className="px-3 py-2 text-center font-mono">{fmtEra(s.era)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* ── Batting ────────────────────────────────────────────────── */}
      {tab === 'batting' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Team toggle */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setBattingTeam('us')}
                className={`px-4 py-2 font-medium transition-colors ${battingTeam === 'us' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {ourLabel}
              </button>
              <button
                onClick={() => setBattingTeam('opp')}
                className={`px-4 py-2 font-medium transition-colors border-l border-gray-200 ${battingTeam === 'opp' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {oppLabel}
              </button>
            </div>

            {/* Standard/Advanced toggle (only for our team — opponent data is limited) */}
            {battingTeam === 'us' && (
              <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
                <button
                  onClick={() => setBattingMode('standard')}
                  className={`px-4 py-2 font-medium transition-colors ${battingMode === 'standard' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setBattingMode('advanced')}
                  className={`px-4 py-2 font-medium transition-colors border-l border-gray-200 ${battingMode === 'advanced' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Advanced
                </button>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {battingTeam === 'us'
              ? <BattingTable rows={ourBatting} advanced={battingMode === 'advanced'} />
              : <OppBattingTable rows={oppBatting} />
            }
          </div>
        </div>
      )}

      {/* ── Pitching ───────────────────────────────────────────────── */}
      {tab === 'pitching' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setPitchingTeam('us')}
                className={`px-4 py-2 font-medium transition-colors ${pitchingTeam === 'us' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {ourLabel}
              </button>
              <button
                onClick={() => setPitchingTeam('opp')}
                className={`px-4 py-2 font-medium transition-colors border-l border-gray-200 ${pitchingTeam === 'opp' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {oppLabel}
              </button>
            </div>

            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setPitchingMode('standard')}
                className={`px-4 py-2 font-medium transition-colors ${pitchingMode === 'standard' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Standard
              </button>
              <button
                onClick={() => setPitchingMode('advanced')}
                className={`px-4 py-2 font-medium transition-colors border-l border-gray-200 ${pitchingMode === 'advanced' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Advanced
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <PitchingTable
              rows={pitchingTeam === 'us' ? ourPitching : oppPitching}
              advanced={pitchingMode === 'advanced'}
            />
          </div>
        </div>
      )}

      {/* ── Fielding ───────────────────────────────────────────────── */}
      {tab === 'fielding' && (
        <div className="p-4">
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-700">{ourLabel} — Fielding</p>
              <p className="text-xs text-gray-400 mt-0.5">PO = Putouts · A = Assists · E = Errors · TC = Total Chances</p>
            </div>
            <FieldingTable rows={ourFielding} />
          </div>
        </div>
      )}

      {/* ── Play-by-Play ────────────────────────────────────────────── */}
      {tab === 'play_by_play' && (
        <PlayByPlayView halfInnings={playByPlay} />
      )}
    </div>
  );
}
