import { HitType } from '../types/game-event';

export type OccupiedBase = 1 | 2 | 3;

/** A base a runner can finish on, with 4 meaning they scored. */
export type FinishBase = 2 | 3 | 4;

/** What the scorer said happened to one runner already on base. */
export type HitRunnerChoice =
  | { kind: 'auto' }
  | { kind: 'held'; toBase: FinishBase }
  | { kind: 'advanced'; toBase: FinishBase }
  | { kind: 'thrown_out' };

export interface HitRunnerOptions {
  /** Where the runner finishes on the standard advance. */
  standardBase: FinishBase;
  /** The base the runner can be held at short of that, or null if none exists. */
  heldBase: 3 | null;
  /** Every base beyond the standard advance the runner can take, lowest first. */
  advancedBases: Array<3 | 4>;
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

const BASE_NAME: Record<FinishBase, string> = { 2: '2B', 3: '3B', 4: 'home' };

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
 * Returns null for other hits: a home run clears the bases, and the per-runner
 * prompt is not shown for it.
 */
export function hitRunnerOptions(
  fromBase: OccupiedBase,
  hitType: HitType,
): HitRunnerOptions | null {
  const batterBase = BATTER_BASE[hitType];
  if (batterBase === undefined) return null;

  const standardBase = Math.min(fromBase + batterBase, 4) as FinishBase;
  const lowestFreeBase = Math.max(fromBase, batterBase) + 1;
  const heldBase = lowestFreeBase < standardBase ? (lowestFreeBase as 3) : null;

  const advancedBases: Array<3 | 4> = [];
  for (let base = standardBase + 1; base <= 4; base++) advancedBases.push(base as 3 | 4);

  return { standardBase, heldBase, advancedBases };
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
  const finishes: Array<{ fromBase: OccupiedBase; finish: FinishBase }> = [];

  for (const { fromBase, choice } of runners) {
    const options = hitRunnerOptions(fromBase, hitType);
    if (!options) return { error: 'Runner outcomes only apply to a single, double or triple.', rbis: 0 };
    if (choice.kind === 'thrown_out') continue;

    let finish: FinishBase;
    if (choice.kind === 'auto') {
      finish = options.standardBase;
    } else if (choice.kind === 'held') {
      if (choice.toBase !== options.heldBase) {
        return { error: `A runner from ${fromBase}B can't be held at ${BASE_NAME[choice.toBase]} on this hit.`, rbis: 0 };
      }
      finish = choice.toBase;
    } else {
      if (!options.advancedBases.includes(choice.toBase as 3 | 4)) {
        return { error: `A runner from ${fromBase}B can't advance to ${BASE_NAME[choice.toBase]} beyond the standard advance on this hit.`, rbis: 0 };
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

  return { error: null, rbis: finishes.filter((f) => f.finish === 4).length };
}
