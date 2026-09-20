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
 * The intended wiring for score.tsx's `PitchInput` in-play props: which
 * `onRecord*` prop maps to which terminal `EventType`. This is the single
 * source of truth `score.tsx` builds its wrapped handlers from (via
 * `wrapInPlayHandlers` below) instead of eleven hand-written
 * `withInPlayPitch(EventType.X, handler)` JSX lines — so the covered set
 * and its terminal types are one auditable, testable object rather than
 * something only checkable by re-reading the JSX.
 *
 * `in-play-pitch.test.ts` asserts the *values* of this map, as a set,
 * equal `IN_PLAY_TERMINAL_EVENTS` — so a terminal event added to that list
 * without a corresponding entry here fails CI. `score.tsx` passing an
 * object to `wrapInPlayHandlers` that omits one of these *keys* is a
 * TypeScript error (`pnpm type-check` fails) because `wrapInPlayHandlers`
 * requires every key below.
 *
 * What this does NOT catch: a brand-new `onRecord*` prop added to
 * `PitchInputProps` for a terminal `EventType` that's already in this map
 * (e.g. a second OUT-flavored handler), wired directly in `score.tsx`'s
 * JSX instead of through `wrapInPlayHandlers`. Nothing short of exercising
 * the rendered screen catches that; see the task-7 fix-round note in
 * task-7-report.md for why that cost wasn't taken on here.
 */
export const IN_PLAY_HANDLER_TERMINALS = {
  onRecordHit: EventType.HIT,
  onRecordHitWithRunnerOutcomes: EventType.HIT,
  onRecordOut: EventType.OUT,
  onRecordError: EventType.FIELD_ERROR,
  onRecordSacFly: EventType.SACRIFICE_FLY,
  onRecordSacBunt: EventType.SACRIFICE_BUNT,
  onRecordSacFlyFromOut: EventType.SACRIFICE_FLY,
  onRecordSacBuntFromOut: EventType.SACRIFICE_BUNT,
  onRecordFieldersChoice: EventType.OUT,
  onRecordDoublePlay: EventType.DOUBLE_PLAY,
  onRecordTriplePlay: EventType.TRIPLE_PLAY,
} as const satisfies Record<string, EventType>;

export type InPlayHandlerName = keyof typeof IN_PLAY_HANDLER_TERMINALS;

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
      // No context (getContext() -> null, e.g. gameState not yet loaded):
      // skip the pitch but still invoke fn. That is safe *only* because
      // every fn this wrapper is ever handed independently re-guards on
      // the same missing state (score.tsx's handlers all early-return on
      // `!gameState`) and therefore no-ops instead of writing a terminal
      // event with no matching pitch. This wrapper does not verify that
      // guarantee — it is a contract on the caller, not something
      // enforced here. Do not pass a `fn` to `withInPlayPitch` that can
      // write a terminal event without first checking the same
      // "no active game" condition `getContext` uses to return null.
      await fn(...args);
    };
  };
}

/**
 * Builds the wrapped `PitchInput` in-play props from `handlers` (one
 * function per key of `IN_PLAY_HANDLER_TERMINALS`) and `withInPlayPitch`
 * (from `makeInPlayPitchWrapper`). `handlers` must supply every key in
 * `IN_PLAY_HANDLER_TERMINALS` — TypeScript rejects a call that omits one,
 * so `score.tsx` cannot silently drop an in-play handler from the wired
 * set without a `pnpm type-check` failure.
 */
export function wrapInPlayHandlers<
  // The `any[]` below is deliberate: it erases each caller's handler-specific
  // argument tuple (HitType, BattedOutType, runner/base pairs, ...) so every
  // handler stays assignable here — the constraint's job is the *key* set,
  // not the arg shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  H extends Record<InPlayHandlerName, (...args: any[]) => Promise<void>>,
>(
  withInPlayPitch: <A extends unknown[]>(
    terminal: EventType,
    fn: (...args: A) => Promise<void>,
  ) => (...args: A) => Promise<void>,
  handlers: H,
): H {
  const wrapped = {} as H;
  (Object.keys(IN_PLAY_HANDLER_TERMINALS) as InPlayHandlerName[]).forEach((name) => {
    const terminal = IN_PLAY_HANDLER_TERMINALS[name];
    wrapped[name] = withInPlayPitch(terminal, handlers[name]) as H[typeof name];
  });
  return wrapped;
}
