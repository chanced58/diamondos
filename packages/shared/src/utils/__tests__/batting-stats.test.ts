import { deriveBattingStats } from '../batting-stats';
import { EventType, HitType } from '../../types/game-event';

type Evt = {
  game_id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
};

const GAME = 'g1';
let seq = 0;
const e = (event_type: string, payload: Record<string, unknown>): Evt => ({
  game_id: GAME,
  sequence_number: seq++,
  event_type,
  payload,
});
const resetSeq = () => { seq = 0; };

const players = [
  { id: 'p1', firstName: 'Alice', lastName: 'Atbat' },
  { id: 'p2', firstName: 'Bob',   lastName: 'Basher' },
];

describe('deriveBattingStats — normalizeBatterId', () => {
  beforeEach(resetSeq);

  it("drops events stamped with the legacy 'unknown-batter' stub without creating a phantom row", () => {
    const events = [
      e(EventType.HIT,       { batterId: 'unknown-batter', hitType: HitType.SINGLE }),
      e(EventType.WALK,      { batterId: 'unknown-batter' }),
      e(EventType.STRIKEOUT, { batterId: 'unknown-batter' }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players);
    expect(stats.has('unknown-batter')).toBe(false);
    expect(stats.size).toBe(0);
  });

  it('drops events with missing batterId (undefined) cleanly', () => {
    const events = [
      e(EventType.HIT,       { hitType: HitType.SINGLE }),
      e(EventType.WALK,      {}),
      e(EventType.STRIKEOUT, {}),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players);
    expect(stats.size).toBe(0);
  });

  it('attributes stats to a real batter when the id is valid', () => {
    const events = [
      e(EventType.HIT,       { batterId: 'p1', hitType: HitType.SINGLE }),
      e(EventType.WALK,      { batterId: 'p1' }),
      e(EventType.STRIKEOUT, { batterId: 'p1' }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players);
    const s = stats.get('p1')!;
    expect(s).toBeDefined();
    expect(s.plateAppearances).toBe(3);
    expect(s.hits).toBe(1);
    expect(s.walks).toBe(1);
    expect(s.strikeouts).toBe(1);
    expect(s.atBats).toBe(2); // walk doesn't count as AB
  });
});

describe('deriveBattingStats — TRIPLE_PLAY handler', () => {
  beforeEach(resetSeq);

  it('credits the batter with a PA and AB on a triple play', () => {
    const events = [
      e(EventType.TRIPLE_PLAY, { batterId: 'p1' }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players);
    const s = stats.get('p1')!;
    expect(s).toBeDefined();
    expect(s.plateAppearances).toBe(1);
    expect(s.atBats).toBe(1);
    expect(s.hits).toBe(0);
  });

  it("doesn't create a phantom row when the triple_play payload carries the legacy stub", () => {
    const events = [
      e(EventType.TRIPLE_PLAY, { batterId: 'unknown-batter' }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players);
    expect(stats.has('unknown-batter')).toBe(false);
  });
});
