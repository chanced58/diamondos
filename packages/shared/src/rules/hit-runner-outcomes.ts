import { HitType } from '../types/game-event';

export type OccupiedBase = 1 | 2 | 3;

/** A base a runner can finish on, with 4 meaning they scored. */
export type FinishBase = 2 | 3 | 4;

/** What the scorer said happened to one runner already on base. A hold can
 *  be at 1st only on a sac bunt (a runner staying put while the batter is out). */
export type HitRunnerChoice =
  | { kind: 'auto' }
  | { kind: 'held'; toBase: 1 | FinishBase }
  | { kind: 'advanced'; toBase: FinishBase }
  | { kind: 'thrown_out' };

/** The play a runner-outcome prompt is for: a hit, or a sacrifice (batter out). */
export type RunnerOutcomePlay =
  | { kind: 'hit'; hitType: HitType }
  | { kind: 'sac_fly' }
  | { kind: 'sac_bunt' };

export interface HitRunnerOptions {
  /** Where the runner finishes on the standard advance. */
  standardBase: FinishBase;
  /** The base the runner can be held at short of that, or null if none exists. */
  heldBase: 3 | null;
  /** Every base beyond the standard advance the runner can take, lowest first. */
  advancedBases: Array<3 | 4>;
  /**
   * The runner's own base when nothing forces him off it, so he can hold
   * there; null when he is forced, or when the caller did not say which bases
   * were occupied (the conservative, pre-existing behavior).
   */
  stayBase: 1 | 2 | 3 | null;
}

export interface HitRunnerEvaluation {
  /** Why these choices cannot all be true at once, or null when they can. */
  error: string | null;
  /** Runners who score on the play — the batter's RBI on the hit (OBR 9.04). */
  rbis: number;
}

const BATTER_BASE: Partial<Record<HitType, 1 | 2 | 3>> = {
  [HitType.SINGLE]: 1,
  [HitType.DOUBLE]: 2,
  [HitType.TRIPLE]: 3,
};

const BASE_NAME: Record<1 | FinishBase, string> = { 1: '1B', 2: '2B', 3: '3B', 4: 'home' };

/**
 * The outcomes open to a runner already on base when the batter singles,
 * doubles or triples, short of being thrown out.
 *
 * Standard: every runner moves up as many bases as the batter took.
 *
 * Held: the runner stops short of that — but only on a base the batter is not
 * taking, above where the runner started. That leaves exactly one real hold:
 * a runner from second, held at third, on a double. Both clients once allowed
 * a hold at the base after the runner's own, which on a double put a runner
 * from first on second, on top of the batter, and the engine's placement
 * overwrote the batter.
 *
 * Advanced: the runner takes more than the standard advance — a runner from
 * second scoring on a single, a runner from first scoring on a double.
 *
 * Stay: a runner nothing forces off his base can hold right there — a runner
 * on second with first open on a single. Needs `occupiedBases` (every base
 * occupied when the ball was hit); see forcedBases.
 *
 * Returns null for other hits: a home run clears the bases, and the per-runner
 * prompt is not shown for it.
 */
export function hitRunnerOptions(
  fromBase: OccupiedBase,
  hitType: HitType,
  occupiedBases?: ReadonlyArray<OccupiedBase>,
): HitRunnerOptions | null {
  const batterBase = BATTER_BASE[hitType];
  if (batterBase === undefined) return null;

  const standardBase = Math.min(fromBase + batterBase, 4) as FinishBase;
  const lowestFreeBase = Math.max(fromBase, batterBase) + 1;
  const heldBase = lowestFreeBase < standardBase ? (lowestFreeBase as 3) : null;

  const advancedBases: Array<3 | 4> = [];
  for (let base = standardBase + 1; base <= 4; base++) advancedBases.push(base as 3 | 4);

  const stayBase =
    occupiedBases && !forcedBases(batterBase, occupiedBases).has(fromBase)
      ? (fromBase as 2 | 3)
      : null;

  return { standardBase, heldBase, advancedBases, stayBase };
}

/**
 * The outcomes open to a runner on a hit or a sacrifice. Hits: see
 * hitRunnerOptions. Sacrifices (OBR 9.08; the batter is out, so nothing
 * forces a runner off his base):
 *   - sac bunt — standard: up one base (a squeeze scores from 3rd); may hold
 *     at his own base; may take more, up to home.
 *   - sac fly — the runner from 3rd scores by default and may hold at 3rd;
 *     runners on 1st/2nd hold by default and may tag up to any base ahead.
 */
export function playRunnerOptions(
  fromBase: OccupiedBase,
  play: RunnerOutcomePlay,
  occupiedBases?: ReadonlyArray<OccupiedBase>,
): HitRunnerOptions | null {
  if (play.kind === 'hit') return hitRunnerOptions(fromBase, play.hitType, occupiedBases);

  const moves = play.kind === 'sac_bunt' || fromBase === 3;
  const standardBase = (moves ? fromBase + 1 : fromBase) as 1 | FinishBase;
  const advancedBases: Array<3 | 4> = [];
  for (let base = standardBase + 1; base <= 4; base++) advancedBases.push(base as 3 | 4);
  return {
    // A runner on 1st or 2nd who holds on a sac fly is already the standard.
    standardBase: standardBase as FinishBase,
    heldBase: null,
    advancedBases,
    stayBase: moves ? fromBase : null,
  };
}

/**
 * The bases whose runners are forced to move on a hit. Walk up from the
 * batter: each runner at or below the highest base already claimed behind
 * him must move to the next base, which claims that one in turn. A runner
 * above it may stay — and then claims nothing new for the runners ahead.
 * Runners on 1st and 3rd on a single: 1st is forced to 2nd; 3rd is not.
 * On a double the batter claims 2nd, so the runner from 1st needs 3rd and
 * the runner on 3rd is forced too.
 */
function forcedBases(batterBase: 1 | 2 | 3, occupiedBases: ReadonlyArray<OccupiedBase>): Set<OccupiedBase> {
  const forced = new Set<OccupiedBase>();
  let claimed: number = batterBase;
  for (const base of [...occupiedBases].sort((a, b) => a - b)) {
    if (base <= claimed) {
      forced.add(base);
      claimed += 1;
    }
  }
  return forced;
}

/**
 * Whether one set of per-runner choices can all be true on the same play, and
 * how many runs it drives in.
 *
 * Each runner's choice is checked against hitRunnerOptions. Then the play as a
 * whole: two runners cannot finish on the same base, and a runner cannot pass
 * the runner who started ahead of them. These combine in ways no single
 * runner's options can see — a runner from second held at third on a double
 * leaves the runner from first nowhere to go but out or home.
 *
 * `runners` must list every runner on base, including those left on the
 * standard advance, because the collision and passing checks need all of them.
 */
export function evaluateHitRunnerOutcomes(
  hitType: HitType,
  runners: ReadonlyArray<{ fromBase: OccupiedBase; choice: HitRunnerChoice }>,
): HitRunnerEvaluation {
  return evaluatePlayRunnerOutcomes({ kind: 'hit', hitType }, runners);
}

/**
 * evaluateHitRunnerOutcomes for any RunnerOutcomePlay. On top of the per-
 * runner, collision and passing checks, a sacrifice must be one (OBR 9.08):
 * a sac fly needs a run to score; a sac bunt needs a runner to advance and
 * none put out.
 */
export function evaluatePlayRunnerOutcomes(
  play: RunnerOutcomePlay,
  runners: ReadonlyArray<{ fromBase: OccupiedBase; choice: HitRunnerChoice }>,
): HitRunnerEvaluation {
  const finishes: Array<{ fromBase: OccupiedBase; finish: 1 | FinishBase }> = [];
  // A runner thrown out on the play no longer forces anyone: once the runner
  // from first is forced out, the runner from second may hold (OBR 5.09(b)(6)).
  const occupiedBases = runners.filter((r) => r.choice.kind !== 'thrown_out').map((r) => r.fromBase);

  for (const { fromBase, choice } of runners) {
    const options = playRunnerOptions(fromBase, play, occupiedBases);
    if (!options) return { error: 'Runner outcomes only apply to a single, double, triple, sac fly or sac bunt.', rbis: 0 };
    if (choice.kind === 'thrown_out') continue;

    let finish: 1 | FinishBase;
    if (choice.kind === 'auto') {
      finish = options.standardBase;
    } else if (choice.kind === 'held') {
      if (choice.toBase !== options.heldBase && choice.toBase !== options.stayBase) {
        return { error: `A runner from ${fromBase}B can't be held at ${BASE_NAME[choice.toBase]} on this play.`, rbis: 0 };
      }
      finish = choice.toBase;
    } else {
      if (!options.advancedBases.includes(choice.toBase as 3 | 4)) {
        return { error: `A runner from ${fromBase}B can't advance to ${BASE_NAME[choice.toBase]} beyond the standard advance on this play.`, rbis: 0 };
      }
      finish = choice.toBase;
    }
    finishes.push({ fromBase, finish });
  }

  const onBase = finishes.filter((f) => f.finish !== 4).map((f) => f.finish);
  const repeated = onBase.find((base, i) => onBase.indexOf(base) !== i);
  if (repeated !== undefined) {
    return { error: `Two runners can't both finish on ${BASE_NAME[repeated]}.`, rbis: 0 };
  }

  const byStart = [...finishes].sort((a, b) => a.fromBase - b.fromBase);
  for (let i = 0; i < byStart.length - 1; i++) {
    const trailing = byStart[i];
    const leading = byStart[i + 1];
    // Strictly greater: a trailing runner scoring while the lead runner stops
    // at third has passed them. Equal finishes are either both home (fine) or
    // already caught above as two runners on one base.
    if (trailing.finish > leading.finish) {
      return { error: `The runner from ${trailing.fromBase}B can't pass the runner from ${leading.fromBase}B.`, rbis: 0 };
    }
  }

  if (play.kind === 'sac_fly' && !finishes.some((f) => f.finish === 4)) {
    return { error: 'No run scored — record it as a fly out instead.', rbis: 0 };
  }
  // OBR 9.08(a): a runner put out attempting to advance one base on the bunt
  // makes it no sacrifice — the batter is charged a time at bat. Which base
  // the runner was out at isn't recorded, so any runner out counts.
  if (play.kind === 'sac_bunt' && runners.some((r) => r.choice.kind === 'thrown_out')) {
    return { error: 'A runner was put out advancing — record it as an out instead.', rbis: 0 };
  }
  if (play.kind === 'sac_bunt' && !finishes.some((f) => f.finish > f.fromBase)) {
    return { error: 'No runner advanced — record it as an out instead.', rbis: 0 };
  }

  return { error: null, rbis: finishes.filter((f) => f.finish === 4).length };
}
