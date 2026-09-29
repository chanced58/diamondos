/**
 * Pure stats helpers for the MaxPreps export. Shared between the TXT (legacy)
 * and XML (Tier 5) output paths so both see identical aggregates.
 *
 * Mirror of packages/shared/src/utils/event-filters.ts + batting-stats.ts
 * logic, inlined because Deno edge functions can't import from
 * @baseball/shared at runtime. Keep in sync when that logic changes.
 *
 * Runner movement on a hit and its linked runner outcomes uses a verbatim
 * copy of packages/shared/src/rules/play-runners.ts (between the markers
 * below); packages/shared/src/rules/__tests__/play-runners-copy.test.ts
 * fails if the two differ.
 */

// ── BEGIN verbatim copy of packages/shared/src/rules/play-runners.ts ──
/**
 * Where runners end up after a play — the one rule every consumer that
 * re-derives base state from the event log shares: deriveGameState, batting
 * and pitching stats, opponent batting stats, the line score, game history
 * (and, as a hand-kept copy, the MaxPreps export).
 *
 * A play's per-runner outcomes, when the scorer recorded any, are separate
 * linked BASERUNNER_OUT / BASERUNNER_ADVANCE (+ SCORE for an advance home)
 * events whose `relatedEventId` points at the play. The play's default
 * advance skips those runners; their linked events then place or remove them.
 *
 * Runner values are generic: most consumers track runner ids, pitching stats
 * tracks `{ id, reachedOnError }`. `idOf` reads the id back out.
 */

export type RunnerBase = 1 | 2 | 3;

/** Who is on each base (null = empty). */
export interface Bases<T> {
  first: T | null;
  second: T | null;
  third: T | null;
}

/**
 * A play that moves runners by a default rule. On a sacrifice the batter is
 * out and never placed: a sac bunt moves every runner up one base (a squeeze
 * scores the runner from 3rd); a sac fly scores the runner from 3rd and
 * holds everyone else (OBR 9.08).
 */
export type RunnerPlay =
  | { kind: 'hit'; bases: 1 | 2 | 3 | 4 }
  | { kind: 'sac_bunt' }
  | { kind: 'sac_fly' };

/** Bases a runner moves on the play's default: the batter's bases on a hit, one on a sac bunt, and on a sac fly only the runner from 3rd. */
function defaultAdvance(play: RunnerPlay, base: RunnerBase): number {
  if (play.kind === 'hit') return play.bases;
  if (play.kind === 'sac_bunt') return 1;
  return base === 3 ? 1 : 0;
}

/** The runners on one play whose outcome a linked event records. */
export interface LinkedRunnerOutcomes {
  /** Older linked outs with no `fromBase`, matched by runner id. */
  outRunnerIds: Set<string>;
  /** Older linked advances with no `fromBase`, matched by runner id. */
  advancedRunnerIds: Set<string>;
  /** Starting bases named by linked events. Matched by base, not id: two
   *  runners can share an id, but never a base. */
  overriddenBases: Set<RunnerBase>;
}

/** The runner fields of a BASERUNNER_ADVANCE / BASERUNNER_OUT payload. */
export interface RunnerMove {
  runnerId?: string;
  fromBase?: number;
  toBase?: number;
  relatedEventId?: string;
}

/** An event in either the camelCase domain shape or a snake_case DB row. */
interface EventLike {
  eventType?: string;
  event_type?: string;
  payload?: unknown;
}

const KEY = { 1: 'first', 2: 'second', 3: 'third' } as const;

/** True for 1, 2 or 3. */
function isRunnerBase(base: unknown): base is RunnerBase {
  return base === 1 || base === 2 || base === 3;
}

/**
 * Groups linked BASERUNNER_OUT / BASERUNNER_ADVANCE events by the play they
 * belong to (`relatedEventId`). Pass void/revert-filtered events.
 */
export function collectLinkedRunnerOutcomes(events: Iterable<EventLike>): Map<string, LinkedRunnerOutcomes> {
  const byPlay = new Map<string, LinkedRunnerOutcomes>();
  for (const event of events) {
    const type = event.eventType ?? event.event_type;
    if (type !== 'baserunner_out' && type !== 'baserunner_advance') continue;
    const p = (event.payload ?? {}) as RunnerMove;
    if (!p.relatedEventId || !p.runnerId) continue;
    let entry = byPlay.get(p.relatedEventId);
    if (!entry) {
      entry = { outRunnerIds: new Set(), advancedRunnerIds: new Set(), overriddenBases: new Set() };
      byPlay.set(p.relatedEventId, entry);
    }
    if (isRunnerBase(p.fromBase)) entry.overriddenBases.add(p.fromBase);
    else if (type === 'baserunner_out') entry.outRunnerIds.add(p.runnerId);
    else entry.advancedRunnerIds.add(p.runnerId);
  }
  return byPlay;
}

/** Whether the runner on `base` has a linked outcome on this play. */
export function isRunnerOverridden<T>(
  runner: T,
  base: RunnerBase,
  overrides: LinkedRunnerOutcomes | undefined,
  idOf: (runner: T) => string,
): boolean {
  if (!overrides) return false;
  if (overrides.overriddenBases.has(base)) return true;
  const runnerId = idOf(runner);
  return overrides.outRunnerIds.has(runnerId) || overrides.advancedRunnerIds.has(runnerId);
}

/**
 * The play's default advance: every runner without a linked outcome moves
 * up by the play's default (see RunnerPlay), scoring at 4+, and on a hit
 * the batter is placed.
 * `scoring` lists who crossed the plate, lead runner first, the batter last
 * on a home run; `runs` counts them (including a home-run batter with no id).
 * Runners with a linked outcome are left off — their linked events place or
 * remove them.
 */
export function applyPlayToRunners<T>(
  runners: Bases<T>,
  play: RunnerPlay,
  batter: T | null,
  overrides: LinkedRunnerOutcomes | undefined,
  idOf: (runner: T) => string,
): { runners: Bases<T>; scoring: T[]; runs: number } {
  const result: Bases<T> = { first: null, second: null, third: null };
  const scoring: T[] = [];
  let runs = 0;

  for (const base of [3, 2, 1] as const) {
    const runner = runners[KEY[base]];
    if (runner === null || isRunnerOverridden(runner, base, overrides, idOf)) continue;
    const destination = base + defaultAdvance(play, base);
    if (destination >= 4) {
      scoring.push(runner);
      runs += 1;
    } else {
      result[KEY[destination as RunnerBase]] = runner;
    }
  }

  if (play.kind !== 'hit') {
    // A sacrifice retires the batter — nobody to place.
  } else if (play.bases === 4) {
    if (batter !== null) scoring.push(batter);
    runs += 1;
  } else {
    result[KEY[play.bases]] = batter;
  }

  return { runners: result, scoring, runs };
}

/**
 * Takes the runner off his base: the named `fromBase` when he is on it; for a
 * linked outcome whose runner the play already dropped, nothing; otherwise
 * the first base holding his id (older events without `fromBase`, and web's
 * history editor, which stores the "Out at" base there). An older move with
 * no runner id can only be matched by base: a standalone one clears its
 * `fromBase`; a linked one clears nothing.
 */
function removeRunner<T>(runners: Bases<T>, move: RunnerMove, idOf: (runner: T) => string): Bases<T> {
  const result = { ...runners };
  const from = move.fromBase;
  if (move.runnerId === undefined) {
    if (isRunnerBase(from) && !move.relatedEventId) result[KEY[from]] = null;
    return result;
  }
  if (isRunnerBase(from)) {
    const onBase = result[KEY[from]];
    if (onBase !== null && idOf(onBase) === move.runnerId) {
      result[KEY[from]] = null;
      return result;
    }
    if (move.relatedEventId) return result;
  }
  for (const base of [1, 2, 3] as const) {
    const onBase = result[KEY[base]];
    if (onBase !== null && idOf(onBase) === move.runnerId) {
      result[KEY[base]] = null;
      break;
    }
  }
  return result;
}

/**
 * A BASERUNNER_ADVANCE: the runner leaves his base (see removeRunner) and is
 * placed on `toBase` as `runnerValue`. An advance home places nothing — the
 * accompanying SCORE event carries the run. A caller replaying a move with no
 * runner id passes a stand-in value so the runner is not lost.
 */
export function applyLinkedAdvance<T>(
  runners: Bases<T>,
  move: RunnerMove,
  runnerValue: T,
  idOf: (runner: T) => string,
): Bases<T> {
  const result = removeRunner(runners, move, idOf);
  if (isRunnerBase(move.toBase)) result[KEY[move.toBase]] = runnerValue;
  return result;
}

/** A BASERUNNER_OUT: the runner leaves the bases (see removeRunner). The caller counts the out. */
export function applyRunnerOut<T>(runners: Bases<T>, move: RunnerMove, idOf: (runner: T) => string): Bases<T> {
  return removeRunner(runners, move, idOf);
}
// ── END verbatim copy of packages/shared/src/rules/play-runners.ts ──

export interface PlayerStats {
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
}

export type RawEvent = {
  id?: string;
  sequence_number?: number;
  event_type: string;
  payload: Record<string, unknown>;
  inning?: number;
  is_top_of_inning: boolean;
};

/**
 * Removes events targeted by EVENT_VOIDED and trims the tail back to
 * revertToSequenceNumber on PITCH_REVERTED.
 */
export function applyCorrections(events: RawEvent[]): RawEvent[] {
  const result: RawEvent[] = [];
  for (const event of events) {
    const etype = event.event_type;
    if (etype === 'pitch_reverted') {
      const keepUntilSeq = (event.payload?.revertToSequenceNumber as number | undefined) ?? 0;
      while (
        result.length > 0 &&
        (result[result.length - 1].sequence_number ?? 0) > keepUntilSeq
      ) {
        result.pop();
      }
    } else if (etype === 'event_voided') {
      const voidedId = event.payload?.voidedEventId as string | undefined;
      if (!voidedId) continue;
      const idx = result.findIndex((e) => e.id === voidedId);
      if (idx !== -1) result.splice(idx, 1);
    } else {
      result.push(event);
    }
  }
  return result;
}

/**
 * Per-batter MaxPreps totals (AB, R, H, 2B, 3B, HR, RBI, BB, SO) from a
 * corrected event log — mirrors batting-stats, with runner movement from the
 * verbatim play-runners copy above.
 */
export function aggregateStats(events: RawEvent[]): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>();

  let r1: string | null = null;
  let r2: string | null = null;
  let r3: string | null = null;

  function get(id: string): PlayerStats {
    if (!stats.has(id)) {
      stats.set(id, { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 });
    }
    return stats.get(id)!;
  }
  function scoreRunner(id: string | null) { if (id) get(id).r++; }
  function clearBases() { r1 = null; r2 = null; r3 = null; }
  function forceAdvance(batterId: string) {
    if (r1 && r2 && r3) scoreRunner(r3);
    if (r1 && r2) r3 = r2;
    if (r1) r2 = r1;
    r1 = batterId;
  }
  const linkedOutcomes = collectLinkedRunnerOutcomes(events);
  const runnerIdOf = (runner: string) => runner;
  const currentBases = (): Bases<string> => ({ first: r1, second: r2, third: r3 });
  const setBases = (next: Bases<string>) => { r1 = next.first; r2 = next.second; r3 = next.third; };

  function creditRbi(batterStats: PlayerStats, payload: Record<string, unknown>, autoDerived: number) {
    const explicit = payload.rbis as number | undefined;
    batterStats.rbi += explicit !== undefined ? explicit : autoDerived;
  }

  for (const event of events) {
    const p = event.payload;
    const etype = event.event_type;

    if (etype === 'inning_change') { clearBases(); continue; }

    const batterId = p.batterId as string | undefined;

    if (etype === 'hit') {
      if (!batterId) continue;
      const s = get(batterId);
      const hitType = p.hitType as string;
      const fieldersChoice = p.fieldersChoice === true;
      s.ab++;
      if (!fieldersChoice) {
        s.h++;
        if (hitType === 'double') s.doubles++;
        else if (hitType === 'triple') s.triples++;
        else if (hitType === 'home_run') s.hr++;
      }
      const bases = hitType === 'home_run' ? 4
        : hitType === 'triple' ? 3
        : hitType === 'double' ? 2
        : 1;
      const played = applyPlayToRunners(
        currentBases(),
        { kind: 'hit', bases: bases as 1 | 2 | 3 | 4 },
        batterId,
        linkedOutcomes.get(event.id ?? ''),
        runnerIdOf,
      );
      for (const runner of played.scoring) scoreRunner(runner);
      const runsScored = played.runs;
      setBases(played.runners);
      creditRbi(s, p, runsScored);
      continue;
    }

    if (etype === 'out') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++;
      if (p.outType === 'strikeout') s.so++;
      creditRbi(s, p, 0);
      continue;
    }

    if (etype === 'strikeout') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++; s.so++;
      continue;
    }

    if (etype === 'double_play' || etype === 'triple_play') {
      if (!batterId) continue;
      get(batterId).ab++;
      if (etype === 'double_play') {
        const runnerOutBase = p.runnerOutBase as number | undefined;
        if (runnerOutBase === 1) r1 = null;
        else if (runnerOutBase === 2) r2 = null;
        else if (runnerOutBase === 3) r3 = null;
      }
      continue;
    }

    if (etype === 'walk') {
      if (!batterId) continue;
      const s = get(batterId);
      s.bb++;
      const forcedRun = !!(r1 && r2 && r3);
      forceAdvance(batterId);
      creditRbi(s, p, forcedRun ? 1 : 0);
      continue;
    }

    if (etype === 'hit_by_pitch' || etype === 'catcher_interference') {
      if (!batterId) continue;
      const s = get(batterId);
      const forcedRun = !!(r1 && r2 && r3);
      forceAdvance(batterId);
      creditRbi(s, p, forcedRun ? 1 : 0);
      continue;
    }

    if (etype === 'sacrifice_fly') {
      if (!batterId) continue;
      const s = get(batterId);
      // An RBI for each run the sac fly scores; linked outcomes are left to their events.
      const played = applyPlayToRunners(currentBases(), { kind: 'sac_fly' }, null, linkedOutcomes.get(event.id ?? ''), runnerIdOf);
      for (const runner of played.scoring) scoreRunner(runner);
      setBases(played.runners);
      creditRbi(s, p, played.runs);
      continue;
    }

    if (etype === 'sacrifice_bunt') {
      if (!batterId) continue;
      const s = get(batterId);
      // Everyone up one, a squeeze scores; linked outcomes are left to their events.
      const played = applyPlayToRunners(currentBases(), { kind: 'sac_bunt' }, null, linkedOutcomes.get(event.id ?? ''), runnerIdOf);
      for (const runner of played.scoring) scoreRunner(runner);
      setBases(played.runners);
      creditRbi(s, p, played.runs);
      continue;
    }

    if (etype === 'field_error') {
      if (!batterId) continue;
      get(batterId).ab++;
      forceAdvance(batterId);
      continue;
    }

    if (etype === 'dropped_third_strike') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++; s.so++;
      if (p.outcome !== 'thrown_out') forceAdvance(batterId);
      continue;
    }

    if (etype === 'stolen_base') {
      const runnerId = p.runnerId as string | undefined;
      const toBase = p.toBase as number | undefined;
      if (!runnerId || !toBase) continue;
      if (r1 === runnerId) r1 = null;
      else if (r2 === runnerId) r2 = null;
      else if (r3 === runnerId) r3 = null;
      if (toBase === 3) r3 = runnerId;
      else if (toBase === 2) r2 = runnerId;
      continue;
    }

    if (etype === 'baserunner_out') {
      if (typeof p.runnerId === 'string') setBases(applyRunnerOut(currentBases(), p, runnerIdOf));
      continue;
    }

    if (etype === 'caught_stealing') {
      const runnerId = p.runnerId as string | undefined;
      if (r1 === runnerId) r1 = null;
      else if (r2 === runnerId) r2 = null;
      else if (r3 === runnerId) r3 = null;
      continue;
    }

    if (etype === 'baserunner_advance') {
      const runnerId = p.runnerId as string | undefined;
      const toBase = p.toBase as number | undefined;
      if (!runnerId || !toBase) continue;
      // toBase 4 places nothing — the SCORE event credits the run.
      setBases(applyLinkedAdvance(currentBases(), p, runnerId, runnerIdOf));
      continue;
    }

    if (etype === 'score') {
      const scoringPlayerId = p.scoringPlayerId as string | undefined;
      if (!scoringPlayerId) continue;
      scoreRunner(scoringPlayerId);
      if (r3 === scoringPlayerId) r3 = null;
      else if (r2 === scoringPlayerId) r2 = null;
      else if (r1 === scoringPlayerId) r1 = null;
      continue;
    }
  }

  return stats;
}
