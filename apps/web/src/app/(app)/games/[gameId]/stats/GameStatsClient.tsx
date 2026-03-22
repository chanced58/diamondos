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

export type OppBattingRow = {
  playerId: string;
  playerName: string;
  pa: number; ab: number; r: number; h: number;
  doubles: number; triples: number; hr: number;
  rbi: number; bb: number; k: number;
  hbp: number; sf: number; sh: number;
  sb: number; cs: number;
  avg: number; obp: number; slg: number; ops: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawGameEvent = Record<string, any>;

export type StatTier = 'youth' | 'high_school' | 'college';

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
  players: PlayerInfo[];
  tier: StatTier;
  baserunning: Record<string, { sb: number; cs: number }>;
}

// ── Display helpers ──────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const s = ['th', 'st', 'nd', 'rd'];
  return n + (s[n % 10] ?? s[0]);
}

function fmtRate(v: number): string { return formatBattingRate(v); }
function fmtPct(v: number): string { return formatBattingPct(v); }
function fmtEra(v: number): string { return isFinite(v) ? v.toFixed(2) : '---'; }
function fmtWhip(v: number): string { return isFinite(v) ? v.toFixed(2) : '---'; }
function fmtDec1(v: number): string { return isFinite(v) && !isNaN(v) ? v.toFixed(1) : '---'; }
function fmtRatio(v: number): string { return isFinite(v) && !isNaN(v) ? v.toFixed(2) : '---'; }

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

// ── Color coding for rate stats ─────────────────────────────────────────────

const RATE_THRESHOLDS: Record<string, { good: number; bad: number; higher: boolean }> = {
  avg:   { good: 0.300, bad: 0.200, higher: true },
  obp:   { good: 0.380, bad: 0.280, higher: true },
  slg:   { good: 0.450, bad: 0.300, higher: true },
  ops:   { good: 0.800, bad: 0.600, higher: true },
  iso:   { good: 0.180, bad: 0.080, higher: true },
  woba:  { good: 0.350, bad: 0.290, higher: true },
  babip: { good: 0.350, bad: 0.240, higher: true },
  kPct:  { good: 0.15, bad: 0.28, higher: false },
  bbPct: { good: 0.10, bad: 0.04, higher: true },
  hardHitPct: { good: 0.35, bad: 0.18, higher: true },
  era:   { good: 2.50, bad: 5.50, higher: false },
  whip:  { good: 1.10, bad: 1.60, higher: false },
  strikePercentage: { good: 0.65, bad: 0.50, higher: true },
  firstPitchStrikePercentage: { good: 0.65, bad: 0.50, higher: true },
};

function rateColor(key: string, value: number): string {
  const t = RATE_THRESHOLDS[key];
  if (!t || !isFinite(value)) return '';
  if (t.higher) {
    if (value >= t.good) return 'bg-green-50';
    if (value <= t.bad) return 'bg-red-50';
  } else {
    if (value <= t.good) return 'bg-green-50';
    if (value >= t.bad) return 'bg-red-50';
  }
  return '';
}

// ── Batting column configuration ────────────────────────────────────────────

type BatCol = {
  label: string;
  get: (s: BattingStats, br: { sb: number; cs: number }) => number;
  fmt: (v: number) => string;
  mono?: boolean;
  color?: string; // key into RATE_THRESHOLDS
};

const BAT: Record<string, BatCol> = {
  AB:    { label: 'AB',    get: (s) => s.atBats, fmt: String },
  R:     { label: 'R',     get: (s) => s.runs, fmt: String },
  H:     { label: 'H',     get: (s) => s.hits, fmt: String },
  '2B':  { label: '2B',    get: (s) => s.doubles, fmt: String },
  '3B':  { label: '3B',    get: (s) => s.triples, fmt: String },
  HR:    { label: 'HR',    get: (s) => s.homeRuns, fmt: String },
  RBI:   { label: 'RBI',   get: (s) => s.rbi, fmt: String },
  BB:    { label: 'BB',    get: (s) => s.walks, fmt: String },
  K:     { label: 'K',     get: (s) => s.strikeouts, fmt: String },
  HBP:   { label: 'HBP',   get: (s) => s.hitByPitch, fmt: String },
  SF:    { label: 'SF',    get: (s) => s.sacrificeFlies, fmt: String },
  SH:    { label: 'SH',    get: (s) => s.sacrificeHits, fmt: String },
  SB:    { label: 'SB',    get: (_, br) => br.sb, fmt: String },
  CS:    { label: 'CS',    get: (_, br) => br.cs, fmt: String },
  TB:    { label: 'TB',    get: (s) => s.hits + s.doubles + 2 * s.triples + 3 * s.homeRuns, fmt: String },
  PA:    { label: 'PA',    get: (s) => s.plateAppearances, fmt: String },
  AVG:   { label: 'AVG',   get: (s) => s.avg, fmt: fmtRate, mono: true, color: 'avg' },
  OBP:   { label: 'OBP',   get: (s) => s.obp, fmt: fmtRate, mono: true, color: 'obp' },
  SLG:   { label: 'SLG',   get: (s) => s.slg, fmt: fmtRate, mono: true, color: 'slg' },
  OPS:   { label: 'OPS',   get: (s) => s.ops, fmt: fmtRate, mono: true, color: 'ops' },
  ISO:   { label: 'ISO',   get: (s) => s.iso, fmt: fmtRate, mono: true, color: 'iso' },
  BABIP: { label: 'BABIP', get: (s) => s.babip, fmt: fmtRate, mono: true, color: 'babip' },
  'K%':  { label: 'K%',    get: (s) => s.kPct, fmt: fmtPct, color: 'kPct' },
  'BB%': { label: 'BB%',   get: (s) => s.bbPct, fmt: fmtPct, color: 'bbPct' },
  wOBA:  { label: 'wOBA',  get: (s) => s.woba, fmt: fmtRate, mono: true, color: 'woba' },
  'HH%': { label: 'HH%',  get: (s) => s.hardHitPct, fmt: fmtPct, color: 'hardHitPct' },
};

const BAT_TIER: Record<StatTier, Record<'standard' | 'advanced', string[]>> = {
  youth: {
    standard: ['AB', 'R', 'H', 'RBI', 'BB', 'K', 'SB', 'AVG', 'OBP', 'OPS'],
    advanced: ['PA', 'OBP', 'SLG', 'OPS', 'BB%', 'K%', 'HH%'],
  },
  high_school: {
    standard: ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'HBP', 'SB', 'AVG'],
    advanced: ['PA', 'OBP', 'SLG', 'OPS', 'ISO', 'BABIP', 'K%', 'BB%', 'wOBA', 'HH%'],
  },
  college: {
    standard: ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'HBP', 'SF', 'SB', 'CS', 'TB', 'AVG'],
    advanced: ['PA', 'OBP', 'SLG', 'OPS', 'ISO', 'BABIP', 'K%', 'BB%', 'wOBA', 'HH%', 'TB'],
  },
};

const BOX_BAT: Record<StatTier, string[]> = {
  youth:       ['AB', 'R', 'H', 'RBI', 'BB', 'K', 'AVG'],
  high_school: ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'AVG'],
  college:     ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'AVG'],
};

// ── Pitching column configuration ───────────────────────────────────────────

type PitchCol = {
  label: string;
  get: (s: PitchingStats) => number;
  fmt: (v: number) => string;
  mono?: boolean;
  color?: string;
};

const PIT: Record<string, PitchCol> = {
  IP:       { label: 'IP',       get: (s) => s.inningsPitchedOuts, fmt: (v) => formatInningsPitched(v), mono: true },
  H:        { label: 'H',        get: (s) => s.hitsAllowed, fmt: String },
  R:        { label: 'R',        get: (s) => s.runsAllowed, fmt: String },
  BB:       { label: 'BB',       get: (s) => s.walksAllowed, fmt: String },
  K:        { label: 'K',        get: (s) => s.strikeouts, fmt: String },
  HBP:      { label: 'HBP',      get: (s) => s.hitBatters, fmt: String },
  WP:       { label: 'WP',       get: (s) => s.wildPitches, fmt: String },
  PC:       { label: 'PC',       get: (s) => s.totalPitches, fmt: String },
  BF:       { label: 'BF',       get: (s) => s.totalPAs, fmt: String },
  'Strike%': { label: 'Strike%', get: (s) => s.strikePercentage, fmt: fmtPct, color: 'strikePercentage' },
  'FPS%':   { label: 'FPS%',     get: (s) => s.firstPitchStrikePercentage, fmt: fmtPct, color: 'firstPitchStrikePercentage' },
  ERA:      { label: 'ERA',      get: (s) => s.era, fmt: fmtEra, mono: true, color: 'era' },
  WHIP:     { label: 'WHIP',     get: (s) => s.whip, fmt: fmtWhip, mono: true, color: 'whip' },
  'K/7':    { label: 'K/7',      get: (s) => s.strikeoutsPerSeven, fmt: fmtDec1 },
  'BB/7':   { label: 'BB/7',     get: (s) => s.walksPerSeven, fmt: fmtDec1 },
  'K/BB':   { label: 'K/BB',     get: (s) => s.walksAllowed > 0 ? s.strikeouts / s.walksAllowed : Infinity, fmt: fmtRatio },
  'K-BB%':  { label: 'K-BB%',    get: (s) => s.totalPAs > 0 ? (s.strikeouts - s.walksAllowed) / s.totalPAs : NaN, fmt: fmtPct },
  '3-Ball%': { label: '3-Ball%', get: (s) => s.threeBallCountPercentage, fmt: fmtPct },
  'P/IP':   { label: 'P/IP',     get: (s) => s.inningsPitchedOuts > 0 ? s.totalPitches / (s.inningsPitchedOuts / 3) : NaN, fmt: fmtDec1 },
  OBA:      { label: 'OBA',      get: (s) => { const ab = s.totalPAs - s.walksAllowed - s.hitBatters; return ab > 0 ? s.hitsAllowed / ab : NaN; }, fmt: fmtRate, mono: true },
};

const PIT_TIER: Record<StatTier, Record<'standard' | 'advanced', string[]>> = {
  youth: {
    standard: ['PC', 'IP', 'H', 'BB', 'K', 'WP', 'HBP', 'Strike%', 'FPS%', 'ERA'],
    advanced: ['P/IP', 'Strike%', 'FPS%', 'K/7', 'BB/7', '3-Ball%', 'WHIP'],
  },
  high_school: {
    standard: ['IP', 'H', 'R', 'BB', 'K', 'HBP', 'WP', 'PC', 'Strike%', 'FPS%', 'ERA', 'WHIP'],
    advanced: ['K/7', 'BB/7', 'K/BB', 'FPS%', '3-Ball%', 'P/IP', 'ERA', 'WHIP'],
  },
  college: {
    standard: ['IP', 'H', 'R', 'BB', 'K', 'HBP', 'WP', 'PC', 'BF', 'Strike%', 'ERA', 'WHIP'],
    advanced: ['K/7', 'BB/7', 'K/BB', 'K-BB%', 'FPS%', '3-Ball%', 'P/IP', 'OBA', 'ERA', 'WHIP'],
  },
};

const BOX_PIT: Record<StatTier, string[]> = {
  youth:       ['PC', 'IP', 'H', 'BB', 'K', 'Strike%', 'ERA'],
  high_school: ['IP', 'H', 'R', 'BB', 'K', 'PC', 'ERA'],
  college:     ['IP', 'H', 'R', 'BB', 'K', 'PC', 'ERA'],
};

// ── Opponent batting column configuration ───────────────────────────────────

type OppCol = {
  label: string;
  get: (s: OppBattingRow) => number;
  fmt: (v: number) => string;
  mono?: boolean;
};

const OPP: Record<string, OppCol> = {
  AB:   { label: 'AB',   get: (s) => s.ab, fmt: String },
  R:    { label: 'R',    get: (s) => s.r, fmt: String },
  H:    { label: 'H',    get: (s) => s.h, fmt: String },
  '2B': { label: '2B',   get: (s) => s.doubles, fmt: String },
  '3B': { label: '3B',   get: (s) => s.triples, fmt: String },
  HR:   { label: 'HR',   get: (s) => s.hr, fmt: String },
  RBI:  { label: 'RBI',  get: (s) => s.rbi, fmt: String },
  BB:   { label: 'BB',   get: (s) => s.bb, fmt: String },
  K:    { label: 'K',    get: (s) => s.k, fmt: String },
  HBP:  { label: 'HBP',  get: (s) => s.hbp, fmt: String },
  SB:   { label: 'SB',   get: (s) => s.sb, fmt: String },
  AVG:  { label: 'AVG',  get: (s) => s.avg, fmt: fmtRate, mono: true },
  OBP:  { label: 'OBP',  get: (s) => s.obp, fmt: fmtRate, mono: true },
  SLG:  { label: 'SLG',  get: (s) => s.slg, fmt: fmtRate, mono: true },
  OPS:  { label: 'OPS',  get: (s) => s.ops, fmt: fmtRate, mono: true },
};

const OPP_TIER: Record<StatTier, string[]> = {
  youth:       ['AB', 'R', 'H', 'RBI', 'BB', 'K', 'AVG'],
  high_school: ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'HBP', 'AVG', 'OBP'],
  college:     ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'HBP', 'SB', 'AVG', 'OBP', 'SLG', 'OPS'],
};

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
  sidelineEvents: string[];
};

type PbpHalfInning = {
  key: string;
  inning: number;
  isTop: boolean;
  label: string;
  atBats: PbpAtBat[];
  runs: number;
  sidelineEvents: string[];
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
        atBats: [], runs: 0, sidelineEvents: [],
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
    // Snapshot to a const so TypeScript doesn't widen through closure captures
    // on the let variable across the else-if chain below.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const half = currentHalf!;

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
    } else if (etype === 'score') {
      half.runs += (payload.rbis as number) ?? 1;
    } else if (etype === 'stolen_base') {
      const runnerId = payload.runnerId as string | undefined;
      const name = runnerId ? (nameMap.get(runnerId) ?? 'Runner') : 'Runner';
      const to = payload.toBase as number ?? 2;
      const note = `SB: ${name} stole ${ordinal(to)} base`;
      if (currentAB) currentAB.sidelineEvents.push(note);
      else if (half.atBats.length > 0) {
        half.atBats[half.atBats.length - 1].sidelineEvents.push(note);
      } else {
        half.sidelineEvents.push(note);
      }
    } else if (etype === 'caught_stealing') {
      const runnerId = payload.runnerId as string | undefined;
      const name = runnerId ? (nameMap.get(runnerId) ?? 'Runner') : 'Runner';
      const note = `CS: ${name} caught stealing`;
      if (currentAB) currentAB.sidelineEvents.push(note);
      else if (half.atBats.length > 0) {
        half.atBats[half.atBats.length - 1].sidelineEvents.push(note);
      } else {
        half.sidelineEvents.push(note);
      }
    } else if (etype === 'pitching_change') {
      const newId = payload.newPitcherId as string | undefined;
      const name = newId ? (nameMap.get(newId) ?? 'Unknown') : 'Unknown';
      const note = `Pitching change: ${name}`;
      if (currentAB) currentAB.sidelineEvents.push(note);
      else if (half.atBats.length > 0) {
        half.atBats[half.atBats.length - 1].sidelineEvents.push(note);
      } else {
        half.sidelineEvents.push(note);
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
      else if (half.atBats.length > 0) {
        half.atBats[half.atBats.length - 1].sidelineEvents.push(note);
      } else {
        half.sidelineEvents.push(note);
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

function ToggleButton({
  label, active, onClick, color = 'brand',
}: {
  label: string; active: boolean; onClick: () => void; color?: 'brand' | 'gray';
}) {
  const activeClass = color === 'brand' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-white';
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium transition-colors text-sm ${active ? activeClass : 'bg-white text-gray-600 hover:bg-gray-50'}`}
    >
      {label}
    </button>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LineScoreTable({
  lineScore, usLabel, oppLabel, weAreHome,
}: {
  lineScore: LineScoreData; usLabel: string; oppLabel: string; weAreHome: boolean;
}) {
  const maxInnings = Math.max(lineScore.awayRunsByInning.length, lineScore.homeRunsByInning.length, 9);
  const inningNums = Array.from({ length: maxInnings }, (_, i) => i + 1);

  const ourRunsByInning = weAreHome ? lineScore.homeRunsByInning : lineScore.awayRunsByInning;
  const oppRunsByInning = weAreHome ? lineScore.awayRunsByInning : lineScore.homeRunsByInning;
  const ourTotalRuns = weAreHome ? lineScore.homeRuns : lineScore.awayRuns;
  const oppTotalRuns = weAreHome ? lineScore.awayRuns : lineScore.homeRuns;
  const ourHits = weAreHome ? lineScore.homeHits : lineScore.awayHits;
  const oppHits = weAreHome ? lineScore.awayHits : lineScore.homeHits;
  const ourErrors = weAreHome ? lineScore.homeErrors : lineScore.awayErrors;
  const oppErrors = weAreHome ? lineScore.awayErrors : lineScore.homeErrors;

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

// ── Column-driven stat tables ───────────────────────────────────────────────

function BattingStatTable({
  rows, columns, baserunning,
}: {
  rows: BattingStats[];
  columns: string[];
  baserunning: Record<string, { sb: number; cs: number }>;
}) {
  const sorted = [...rows].sort((a, b) => b.plateAppearances - a.plateAppearances);
  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 px-5 py-4">No batting data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 font-semibold text-gray-600 text-left">Player</th>
            {columns.map((k) => (
              <th key={k} className="px-3 py-2 font-semibold text-gray-600 text-center">{BAT[k]?.label ?? k}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => {
            const br = baserunning[s.playerId] ?? { sb: 0, cs: 0 };
            return (
              <tr key={s.playerId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
                {columns.map((k) => {
                  const col = BAT[k];
                  if (!col) return <td key={k} className="px-3 py-2 text-center">—</td>;
                  const val = col.get(s, br);
                  const cc = col.color ? rateColor(col.color, val) : '';
                  return (
                    <td key={k} className={`px-3 py-2 text-center ${col.mono ? 'font-mono' : ''} ${cc}`}>
                      {col.fmt(val)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OppBattingStatTable({
  rows, columns,
}: {
  rows: OppBattingRow[];
  columns: string[];
}) {
  const sorted = [...rows].sort((a, b) => b.pa - a.pa);
  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 px-5 py-4">No batting data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 font-semibold text-gray-600 text-left">Player</th>
            {columns.map((k) => (
              <th key={k} className="px-3 py-2 font-semibold text-gray-600 text-center">{OPP[k]?.label ?? k}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              {columns.map((k) => {
                const col = OPP[k];
                if (!col) return <td key={k} className="px-3 py-2 text-center">—</td>;
                return (
                  <td key={k} className={`px-3 py-2 text-center ${col.mono ? 'font-mono' : ''}`}>
                    {col.fmt(col.get(s))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitchingStatTable({
  rows, columns,
}: {
  rows: PitchingStats[];
  columns: string[];
}) {
  const sorted = [...rows].sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);
  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 px-5 py-4">No pitching data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 font-semibold text-gray-600 text-left">Pitcher</th>
            {columns.map((k) => (
              <th key={k} className="px-3 py-2 font-semibold text-gray-600 text-center">{PIT[k]?.label ?? k}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              {columns.map((k) => {
                const col = PIT[k];
                if (!col) return <td key={k} className="px-3 py-2 text-center">—</td>;
                const val = col.get(s);
                const cc = col.color ? rateColor(col.color, val) : '';
                return (
                  <td key={k} className={`px-3 py-2 text-center ${col.mono ? 'font-mono' : ''} ${cc}`}>
                    {col.fmt(val)}
                  </td>
                );
              })}
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

// ── Play-by-Play view ───────────────────────────────────────────────────────

function PlayByPlayView({ halfInnings }: { halfInnings: PbpHalfInning[] }) {
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
                {half.sidelineEvents.length > 0 && (
                  <div className="px-5 py-2 space-y-0.5">
                    {half.sidelineEvents.map((note, si) => (
                      <div key={si} className="text-xs text-indigo-600 italic">{note}</div>
                    ))}
                  </div>
                )}
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

const TIER_LABEL: Record<StatTier, string> = {
  youth: 'Youth',
  high_school: 'HS',
  college: 'College',
};

export function GameStatsClient({
  game, events, ourBatting, oppBatting, ourPitching, oppPitching,
  ourFielding, lineScore, players, tier, baserunning,
}: GameStatsClientProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('box_score');
  const [battingTeam, setBattingTeam] = useState<'us' | 'opp'>('us');
  const [pitchingTeam, setPitchingTeam] = useState<'us' | 'opp'>('us');
  const [battingMode, setBattingMode] = useState<'standard' | 'advanced'>('standard');
  const [pitchingMode, setPitchingMode] = useState<'standard' | 'advanced'>('standard');

  const weAreHome = game.locationType === 'home';
  const ourLabel = game.teamName;
  const oppLabel = game.opponentName;

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of players) m.set(p.id, p.name);
    return m;
  }, [players]);

  const playByPlay = useMemo(() => buildPlayByPlay(events, nameMap), [events, nameMap]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'box_score', label: 'Box Score' },
    { id: 'batting', label: 'Batting' },
    { id: 'pitching', label: 'Pitching' },
    { id: 'fielding', label: 'Fielding' },
    { id: 'play_by_play', label: 'Play-by-Play' },
  ];

  return (
    <div className="w-full">
      {/* Tab bar with tier indicator */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {tabs.map((t) => (
            <TabButton key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
          ))}
        </div>
        <span className="text-xs text-gray-400 px-3 shrink-0">{TIER_LABEL[tier]} Stats</span>
      </div>

      {/* ── Box Score ──────────────────────────────────────────────── */}
      {tab === 'box_score' && (
        <div className="p-4 space-y-4">
          <LineScoreTable lineScore={lineScore} usLabel={ourLabel} oppLabel={oppLabel} weAreHome={weAreHome} />

          <CollapsibleSection title={`Batting — ${ourLabel}`}>
            <BattingStatTable rows={ourBatting} columns={BOX_BAT[tier]} baserunning={baserunning} />
          </CollapsibleSection>

          <CollapsibleSection title={`Batting — ${oppLabel}`} defaultOpen={false}>
            <OppBattingStatTable rows={oppBatting} columns={OPP_TIER[tier]} />
          </CollapsibleSection>

          <CollapsibleSection title={`Pitching — ${ourLabel}`}>
            <PitchingStatTable rows={ourPitching} columns={BOX_PIT[tier]} />
          </CollapsibleSection>

          <CollapsibleSection title={`Pitching — ${oppLabel}`} defaultOpen={false}>
            <PitchingStatTable rows={oppPitching} columns={BOX_PIT[tier]} />
          </CollapsibleSection>
        </div>
      )}

      {/* ── Batting ────────────────────────────────────────────────── */}
      {tab === 'batting' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <ToggleButton label={ourLabel} active={battingTeam === 'us'} onClick={() => setBattingTeam('us')} />
              <div className="border-l border-gray-200" />
              <ToggleButton label={oppLabel} active={battingTeam === 'opp'} onClick={() => setBattingTeam('opp')} />
            </div>
            {battingTeam === 'us' && (
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <ToggleButton label="Standard" active={battingMode === 'standard'} onClick={() => setBattingMode('standard')} color="gray" />
                <div className="border-l border-gray-200" />
                <ToggleButton label="Advanced" active={battingMode === 'advanced'} onClick={() => setBattingMode('advanced')} color="gray" />
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {battingTeam === 'us'
              ? <BattingStatTable rows={ourBatting} columns={BAT_TIER[tier][battingMode]} baserunning={baserunning} />
              : <OppBattingStatTable rows={oppBatting} columns={OPP_TIER[tier]} />
            }
          </div>
        </div>
      )}

      {/* ── Pitching ───────────────────────────────────────────────── */}
      {tab === 'pitching' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <ToggleButton label={ourLabel} active={pitchingTeam === 'us'} onClick={() => setPitchingTeam('us')} />
              <div className="border-l border-gray-200" />
              <ToggleButton label={oppLabel} active={pitchingTeam === 'opp'} onClick={() => setPitchingTeam('opp')} />
            </div>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <ToggleButton label="Standard" active={pitchingMode === 'standard'} onClick={() => setPitchingMode('standard')} color="gray" />
              <div className="border-l border-gray-200" />
              <ToggleButton label="Advanced" active={pitchingMode === 'advanced'} onClick={() => setPitchingMode('advanced')} color="gray" />
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <PitchingStatTable
              rows={pitchingTeam === 'us' ? ourPitching : oppPitching}
              columns={PIT_TIER[tier][pitchingMode]}
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
