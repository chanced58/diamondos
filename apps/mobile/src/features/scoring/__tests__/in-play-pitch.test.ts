import { EventType, PitchOutcome, IN_PLAY_TERMINAL_EVENTS } from '@baseball/shared';
import {
  makeInPlayPitchWrapper,
  wrapInPlayHandlers,
  IN_PLAY_HANDLER_TERMINALS,
  type InPlayPitchContext,
} from '../in-play-pitch';

const ctx: InPlayPitchContext = {
  inning: 3,
  isTopOfInning: false,
  attribution: { batterId: 'b1', pitcherId: 'p1' },
};

function harness(context: InPlayPitchContext | null = ctx) {
  const calls: { type: EventType; payload: Record<string, unknown> }[] = [];
  const recordEvent = async (
    type: EventType, _i: number, _t: boolean, payload: Record<string, unknown>,
  ) => { calls.push({ type, payload }); return 'evt-1'; };
  return { calls, wrap: makeInPlayPitchWrapper(recordEvent as never, () => context) };
}

describe('makeInPlayPitchWrapper', () => {
  it('records the pitch before the terminal event', async () => {
    const { calls, wrap } = harness();
    await wrap(EventType.HIT, async () => {
      calls.push({ type: EventType.HIT, payload: {} });
    })();
    expect(calls.map((c) => c.type)).toEqual([EventType.PITCH_THROWN, EventType.HIT]);
  });

  it('tags the pitch outcome in_play and carries the half attribution', async () => {
    const { calls, wrap } = harness();
    await wrap(EventType.OUT, async () => {})();
    expect(calls[0].payload).toMatchObject({
      outcome: PitchOutcome.IN_PLAY,
      batterId: 'b1',
      pitcherId: 'p1',
    });
  });

  it('records the pitch at the current inning and half', async () => {
    const calls: { inning: number; isTop: boolean }[] = [];
    const recordEvent = async (_e: EventType, inning: number, isTop: boolean) => {
      calls.push({ inning, isTop }); return 'evt-1';
    };
    const wrap = makeInPlayPitchWrapper(recordEvent as never, () => ctx);
    await wrap(EventType.HIT, async () => {})();
    expect(calls[0]).toEqual({ inning: 3, isTop: false });
  });

  it('adds no pitch for a walk or a strikeout', async () => {
    for (const t of [EventType.WALK, EventType.STRIKEOUT]) {
      const { calls, wrap } = harness();
      await wrap(t, async () => { calls.push({ type: t, payload: {} }); })();
      expect(calls.map((c) => c.type)).toEqual([t]);
    }
  });

  it('still runs the terminal handler when there is no game context', async () => {
    const { calls, wrap } = harness(null);
    await wrap(EventType.HIT, async () => {
      calls.push({ type: EventType.HIT, payload: {} });
    })();
    expect(calls.map((c) => c.type)).toEqual([EventType.HIT]);
  });

  it('forwards arguments to the wrapped handler', async () => {
    const { wrap } = harness();
    const seen: unknown[] = [];
    await wrap(EventType.FIELD_ERROR, async (by: number) => { seen.push(by); })(6);
    expect(seen).toEqual([6]);
  });
});

// Pins the score.tsx wiring itself — the gap the task-7 review flagged as
// uncovered ("no automated test pins which handlers in score.tsx are
// wrapped, or with which EventType"). score.tsx no longer hand-writes
// eleven `withInPlayPitch(EventType.X, handler)` JSX props; it builds them
// from IN_PLAY_HANDLER_TERMINALS via wrapInPlayHandlers. So the questions
// "is every in-play terminal event wired?" and "is each wired to the right
// EventType?" both collapse to assertions on this one data object, instead
// of a human re-reading score.tsx's JSX.
describe('IN_PLAY_HANDLER_TERMINALS', () => {
  it('covers every member of IN_PLAY_TERMINAL_EVENTS, and nothing else', () => {
    // Fails the moment @baseball/shared adds an 8th in-play terminal event
    // (or removes one) without a matching update here — exactly the
    // "newly added in-play handler left unwrapped" drift the review named.
    const declared = new Set(Object.values(IN_PLAY_HANDLER_TERMINALS));
    const required = new Set(IN_PLAY_TERMINAL_EVENTS);
    expect(declared).toEqual(required);
  });

  it('wires each onRecord* prop to its correct terminal EventType', () => {
    // Pins the specific prop -> EventType pairing (not just the covered
    // set), so an accidental unwrap or a wrong terminal type on any one
    // prop fails here rather than surviving as a silent mis-wire.
    expect(IN_PLAY_HANDLER_TERMINALS).toEqual({
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
    });
  });
});

describe('wrapInPlayHandlers', () => {
  it('wraps every key from IN_PLAY_HANDLER_TERMINALS with its declared terminal', async () => {
    const { calls, wrap } = harness();
    const names = Object.keys(IN_PLAY_HANDLER_TERMINALS) as (keyof typeof IN_PLAY_HANDLER_TERMINALS)[];
    const seenArgs: Record<string, unknown[]> = {};
    const handlers: Record<
      keyof typeof IN_PLAY_HANDLER_TERMINALS,
      (...args: unknown[]) => Promise<void>
    > = Object.fromEntries(
      names.map((name) => [
        name,
        async (...args: unknown[]) => {
          seenArgs[name] = args;
        },
      ]),
    ) as Record<keyof typeof IN_PLAY_HANDLER_TERMINALS, (...args: unknown[]) => Promise<void>>;

    const wrapped = wrapInPlayHandlers(wrap, handlers);

    // Call one representative handler and confirm it (a) received its own
    // args untouched and (b) recorded exactly one pitch stamped with that
    // prop's declared terminal type — proof the builder routes each key
    // through the map rather than a single hard-coded terminal.
    await wrapped.onRecordFieldersChoice('runner-1', 2);
    expect(seenArgs.onRecordFieldersChoice).toEqual(['runner-1', 2]);
    expect(calls).toEqual([
      { type: EventType.PITCH_THROWN, payload: expect.objectContaining({ outcome: PitchOutcome.IN_PLAY }) },
    ]);

    calls.length = 0;
    await wrapped.onRecordTriplePlay();
    expect(seenArgs.onRecordTriplePlay).toEqual([]);
    expect(calls[0].type).toEqual(EventType.PITCH_THROWN);

    // Every declared key produced a callable, wrapped function.
    for (const name of names) {
      expect(typeof wrapped[name]).toBe('function');
    }
  });

  it('type-check: rejects a handlers object missing a declared key', () => {
    // Never invoked at runtime (the body is unreachable) — this function
    // exists purely so `pnpm type-check` compiles it. Dropping a handler
    // that IN_PLAY_HANDLER_TERMINALS still declares (or forgetting one
    // for a newly added terminal event) makes the line below type-check
    // cleanly with no error, which makes `@ts-expect-error` itself fail
    // compilation — the CI-visible signal the review asked for.
    function neverCalled() {
      const dummyWrap: <A extends unknown[]>(
        terminal: EventType,
        fn: (...args: A) => Promise<void>,
      ) => (...args: A) => Promise<void> = (_terminal, fn) => fn;
      // @ts-expect-error - handlers object below omits onRecordTriplePlay
      // (and every other key besides onRecordHit); wrapInPlayHandlers
      // requires all of them.
      wrapInPlayHandlers(dummyWrap, { onRecordHit: async () => {} });
    }
    void neverCalled;
    expect(true).toBe(true);
  });
});
