import type { LiveGameState } from '../types/game';
import { HitTrajectory } from '../types/game-event';

export interface SacrificeEligibility {
  sacFly: boolean;
  sacBunt: boolean;
}

/**
 * OBR 9.08 — no sacrifice of either kind is credited with two out, because
 * the batter's out ends the inning and nothing productive can follow.
 *
 * 9.08(a) sacrifice bunt: "when, before two are out, the batter advances one
 * or more runners with a bunt". Only the out constraint is enforced here —
 * whether a runner actually advanced is the scorer's judgment.
 *
 * 9.08(d) sacrifice fly: additionally requires a fly ball or line drive, and
 * a runner able to score on the catch (second or third).
 *
 * `trajectory` is optional because the in-play sheet offers Sac Fly before
 * the batted-ball type is known; an omitted trajectory does not disqualify.
 */
export function sacrificeEligibility(
  state: Pick<LiveGameState, 'outs' | 'runnersOnBase'>,
  trajectory?: HitTrajectory,
): SacrificeEligibility {
  const beforeTwoOuts = state.outs < 2;
  if (!beforeTwoOuts) return { sacFly: false, sacBunt: false };

  const runnerCanScore =
    !!state.runnersOnBase.second || !!state.runnersOnBase.third;
  const trajectoryAllowsFly =
    trajectory === undefined ||
    trajectory === HitTrajectory.FLY_BALL ||
    trajectory === HitTrajectory.LINE_DRIVE;

  return {
    sacFly: runnerCanScore && trajectoryAllowsFly,
    sacBunt: true,
  };
}
