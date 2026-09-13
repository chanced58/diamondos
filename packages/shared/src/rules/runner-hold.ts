import { HitType } from '../types/game-event';

export type OccupiedBase = 1 | 2 | 3;

export interface ExtraBaseHitRunnerOptions {
  /** Where the runner ends up on the standard advance: a base, or 4 for scored. */
  standardBase: 3 | 4;
  /** The one base the runner could stop short at, or null when none exists. */
  heldBase: 3 | null;
}

const BATTER_BASE: Partial<Record<HitType, 2 | 3>> = {
  [HitType.DOUBLE]: 2,
  [HitType.TRIPLE]: 3,
};

/**
 * What a runner already on base can do on a double or triple, short of being
 * thrown out.
 *
 * A runner "held" stops short of the standard advance — but can only stop on
 * a base the batter is not taking. The batter occupies second on a double and
 * third on a triple, so a hold has to land strictly above the batter's base
 * and strictly below the standard destination, and above where the runner
 * started. That leaves exactly one real hold: a runner on second, held at
 * third on a double.
 *
 * Both clients used to allow a hold at the base after the runner's own
 * (`fromBase + 1`), which offered "held at 2B" to a runner from first on a
 * double. Recording it put the runner on second on top of the batter, and the
 * engine's placement overwrote the batter — the player who doubled vanished
 * from the bases with nothing in the log to say how.
 *
 * Returns null for anything other than a double or triple, which the per-
 * runner outcomes prompt is not shown for.
 */
export function extraBaseHitRunnerOptions(
  fromBase: OccupiedBase,
  hitType: HitType,
): ExtraBaseHitRunnerOptions | null {
  const batterBase = BATTER_BASE[hitType];
  if (batterBase === undefined) return null;

  const standardBase = Math.min(fromBase + batterBase, 4) as 3 | 4;
  const lowestFreeBase = Math.max(fromBase, batterBase) + 1;
  const heldBase = lowestFreeBase < standardBase ? (lowestFreeBase as 3) : null;

  return { standardBase, heldBase };
}
