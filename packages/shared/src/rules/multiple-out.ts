import type { LiveGameState } from '../types/game';
import { OUTS_PER_INNING } from '../constants/baseball';

export interface MultipleOutEligibility {
  doublePlay: boolean;
  triplePlay: boolean;
}

/**
 * A multiple-out play needs enough runners to retire AND enough outs left in
 * the half-inning to record them.
 *
 * Runners: the batter supplies one out, so every additional out has to come
 * from a runner already on base. A double play therefore needs at least one
 * runner, a triple play at least two. With the bases empty a double play is
 * not merely unlikely, it is impossible — there is nobody else to put out.
 *
 * Outs: the half-inning ends the moment the third out is recorded, so a play
 * cannot record more outs than remain. With two down, the batter's out ends
 * the inning and no double play can follow; a triple play needs a clean slate.
 *
 * Both conditions are checked here rather than in the UI so the mobile sheet
 * and the web scoring board cannot drift — the same reason sacrifice
 * eligibility lives in this seam.
 */
export function multipleOutEligibility(
  state: Pick<LiveGameState, 'outs' | 'runnersOnBase'>,
): MultipleOutEligibility {
  const runnersOn =
    (state.runnersOnBase.first ? 1 : 0) +
    (state.runnersOnBase.second ? 1 : 0) +
    (state.runnersOnBase.third ? 1 : 0);

  const outsRemaining = OUTS_PER_INNING - state.outs;

  return {
    doublePlay: runnersOn >= 1 && outsRemaining >= 2,
    triplePlay: runnersOn >= 2 && outsRemaining >= 3,
  };
}
