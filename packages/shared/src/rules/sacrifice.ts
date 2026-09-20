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
 * or more runners with a bunt" — so it needs fewer than two outs AND at least
 * one runner on base to advance. Whether the runner actually advanced on the
 * play is the scorer's judgment and is not decided here.
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

  // A bunt can only be a sacrifice if there is somebody to advance. With the
  // bases empty a bunt out is an ordinary out, never an SH.
  const anyRunnerOn =
    !!state.runnersOnBase.first ||
    !!state.runnersOnBase.second ||
    !!state.runnersOnBase.third;
  // A bunt is a ball on the ground. Once the out's trajectory is known, a fly
  // or line drive rules out a sacrifice bunt — a bunted pop-up caught is an
  // ordinary out. An unknown trajectory (the pre-out gate) does not disqualify.
  const trajectoryAllowsBunt =
    trajectory === undefined || trajectory === HitTrajectory.GROUND_BALL;

  return {
    sacFly: runnerCanScore && trajectoryAllowsFly,
    sacBunt: anyRunnerOn && trajectoryAllowsBunt,
  };
}
