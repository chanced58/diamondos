import {
  EventType,
  PitchOutcome,
  requiresPitchEvent,
  type GameEventPayload,
  type PitchThrownPayload,
  type HalfAttribution,
} from '@baseball/shared';

export interface InPlayPitchContext {
  inning: number;
  isTopOfInning: boolean;
  attribution: HalfAttribution;
}

export type RecordEventFn = (
  eventType: EventType,
  inning: number,
  isTopOfInning: boolean,
  payload: GameEventPayload,
) => Promise<string>;

/**
 * Wraps an in-play terminal handler so the PITCH_THROWN that every batted
 * ball implies is recorded first.
 *
 * Pitch counting reads PITCH_THROWN only (packages/shared/src/utils/
 * pitch-count.ts), so an in-play terminal without its pitch silently
 * undercounts the pitcher — and NFHS / Little League compliance is enforced
 * against that number.
 *
 * This exists as one choke point because the web scorer funnels every
 * in-play result through four functions while mobile has roughly a dozen
 * separate handlers; wrapping at the single prop boundary is what keeps
 * them from drifting again.
 */
export function makeInPlayPitchWrapper(
  recordEvent: RecordEventFn,
  getContext: () => InPlayPitchContext | null,
) {
  return function withInPlayPitch<A extends unknown[]>(
    terminal: EventType,
    fn: (...args: A) => Promise<void>,
  ): (...args: A) => Promise<void> {
    return async (...args: A) => {
      const ctx = getContext();
      if (ctx && requiresPitchEvent(terminal)) {
        const pitchPayload: PitchThrownPayload = {
          ...ctx.attribution,
          outcome: PitchOutcome.IN_PLAY,
        };
        await recordEvent(
          EventType.PITCH_THROWN,
          ctx.inning,
          ctx.isTopOfInning,
          pitchPayload,
        );
      }
      await fn(...args);
    };
  };
}
