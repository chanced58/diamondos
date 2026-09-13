import type { BattedBall } from '@baseball/shared';

/** The batted-ball keys an in-play event payload carries. Absent keys mean "not recorded". */
export interface BattedBallPayloadFields {
  sprayX?: number;
  sprayY?: number;
  fieldingSequence?: number[];
}

/**
 * The one place in-play payload fields are built, so every handler writes the
 * same shape. A skipped play yields no keys at all: a null or zero location
 * would plot as a real ball at home plate.
 *
 * `throws` is the throw step's result, first fielder included; without it the
 * first fielder alone becomes the sequence.
 */
export function battedBallPayloadFields(
  battedBall: BattedBall | null,
  throws?: readonly number[],
): BattedBallPayloadFields {
  if (!battedBall) return {};
  const fields: BattedBallPayloadFields = { sprayX: battedBall.sprayX, sprayY: battedBall.sprayY };
  if (throws && throws.length > 0) {
    fields.fieldingSequence = [...throws];
  } else if (battedBall.firstFielder !== null) {
    fields.fieldingSequence = [battedBall.firstFielder];
  }
  return fields;
}

/**
 * Carries batted-ball fields from PitchInput to the one in-play handler that
 * records them. PitchInput sets it immediately before invoking a terminal
 * handler — with {} when nothing was captured — and the handler takes it,
 * which empties it. score.tsx also clears it on every non-in-play pitch, so a
 * location abandoned mid-flow can never attach to a later play.
 */
export function createBattedBallSlot() {
  let current: BattedBallPayloadFields = {};
  return {
    set(fields: BattedBallPayloadFields): void {
      current = fields;
    },
    take(): BattedBallPayloadFields {
      const fields = current;
      current = {};
      return fields;
    },
    clear(): void {
      current = {};
    },
  };
}

export type BattedBallSlot = ReturnType<typeof createBattedBallSlot>;
