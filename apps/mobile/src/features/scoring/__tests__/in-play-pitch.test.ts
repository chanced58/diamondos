import { EventType, PitchOutcome } from '@baseball/shared';
import { makeInPlayPitchWrapper, type InPlayPitchContext } from '../in-play-pitch';

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
