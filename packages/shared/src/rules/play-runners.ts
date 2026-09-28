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
