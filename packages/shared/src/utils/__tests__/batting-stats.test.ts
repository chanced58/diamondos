import { deriveBattingStats, type BattingLineupContext } from '../batting-stats';
import { EventType, HitType } from '../../types/game-event';

type Evt = {
  game_id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  is_top_of_inning: boolean;
};

const GAME = 'g1';
let seq = 0;
let topOfInning = true;
const e = (
  event_type: string,
  payload: Record<string, unknown>,
  isTop = topOfInning,
): Evt => ({
  game_id: GAME,
  sequence_number: seq++,
  event_type,
  payload,
  is_top_of_inning: isTop,
});
const resetSeq = () => { seq = 0; topOfInning = true; };

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

describe('deriveBattingStats — lineup-replay batter inference', () => {
  beforeEach(resetSeq);

  const ourLineupCtx = (isHome: boolean): BattingLineupContext => ({
    isHome,
    ourLineup: [
      { playerId: 'p1', battingOrder: 1 },
      { playerId: 'p2', battingOrder: 2 },
      { playerId: 'p3', battingOrder: 3 },
    ],
  });

  it('attributes a null-batter PA to the expected lineup slot when our team is batting', () => {
    // Home team at bat = bottom of inning (isTop=false). We are home.
    const events = [
      e(EventType.HIT, { hitType: HitType.SINGLE }, false), // slot 1 (p1)
      e(EventType.OUT, { outType: 'groundout' },    false), // slot 2 (p2)
      e(EventType.WALK, {},                         false), // slot 3 (p3)
      e(EventType.STRIKEOUT, {},                    false), // wraps back to slot 1 (p1)
    ];
    const lineups = new Map([[GAME, ourLineupCtx(true)]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players, lineups);
    expect(stats.get('p1')?.plateAppearances).toBe(2);
    expect(stats.get('p1')?.strikeouts).toBe(1);
    expect(stats.get('p1')?.hits).toBe(1);
    expect(stats.get('p2')?.plateAppearances).toBe(1);
    expect(stats.get('p3')?.plateAppearances).toBe(1);
    expect(stats.has('unknown-batter')).toBe(false);
  });

  it('attributes PAs correctly when we are the visitor (top of inning = our bat)', () => {
    const events = [
      e(EventType.HIT, { hitType: HitType.SINGLE }, true),
      e(EventType.OUT, { outType: 'flyout' },       true),
    ];
    const lineups = new Map([[GAME, ourLineupCtx(false)]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players, lineups);
    expect(stats.get('p1')?.plateAppearances).toBe(1);
    expect(stats.get('p2')?.plateAppearances).toBe(1);
  });

  it('does not infer for the opposing half-inning (isTop events when we are home)', () => {
    const events = [e(EventType.HIT, { hitType: HitType.SINGLE }, true)];
    const lineups = new Map([[GAME, ourLineupCtx(true)]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players, lineups);
    expect(stats.size).toBe(0);
  });

  it('prefers a real batterId over inference', () => {
    const events = [
      e(EventType.HIT, { batterId: 'p2', hitType: HitType.SINGLE }, false),
    ];
    const lineups = new Map([[GAME, ourLineupCtx(true)]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players, lineups);
    expect(stats.get('p2')?.plateAppearances).toBe(1);
    expect(stats.has('p1')).toBe(false);
  });

  it('treats the stub as missing and falls back to inference', () => {
    const events = [
      e(EventType.HIT, { batterId: 'unknown-batter', hitType: HitType.SINGLE }, false),
    ];
    const lineups = new Map([[GAME, ourLineupCtx(true)]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players, lineups);
    expect(stats.get('p1')?.plateAppearances).toBe(1);
    expect(stats.has('unknown-batter')).toBe(false);
  });

  it('drops the event when no lineup is supplied (backwards-compatible)', () => {
    const events = [e(EventType.HIT, { hitType: HitType.SINGLE }, false)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players);
    expect(stats.size).toBe(0);
  });

  it('tracks pinch-hitter substitutions so inferred PAs land on the new player', () => {
    const events = [
      e(EventType.HIT, { hitType: HitType.SINGLE }, false), // slot 1 (p1)
      e('substitution', { inPlayerId: 'p9', outPlayerId: 'p2' }, false),
      e(EventType.HIT, { hitType: HitType.SINGLE }, false), // slot 2 now = p9
    ];
    const lineups = new Map([[GAME, ourLineupCtx(true)]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players, lineups);
    expect(stats.get('p1')?.plateAppearances).toBe(1);
    expect(stats.get('p9')?.plateAppearances).toBe(1);
    expect(stats.has('p2')).toBe(false);
  });

  it('attributes a substitution-by-position correctly when the lineup has batting-order gaps', () => {
    // Lineup has slots 1 and 3 only (slot 2 missing). A substitution comes
    // in for battingOrderPosition 3; it should land on the slot-3 entry,
    // not on the second dense-packed array element (which would be wrong
    // if we used idx = 3 - 1 without a battingOrder lookup).
    const gappyLineup: BattingLineupContext = {
      isHome: true,
      ourLineup: [
        { playerId: 'p1', battingOrder: 1 },
        { playerId: 'p3', battingOrder: 3 },
      ],
    };
    const events = [
      // sub in p9 at position 3; no outPlayerId (slot had occupant but sub tracked by position)
      e('substitution', { inPlayerId: 'p9', battingOrderPosition: 3 }, false),
      // PA 1 (slot 1 → p1)
      e(EventType.HIT, { hitType: HitType.SINGLE }, false),
      // PA 2 (dense-packed index 1 → now p9, which IS the real slot-3 player)
      e(EventType.OUT, { outType: 'groundout' }, false),
    ];
    const lineups = new Map([[GAME, gappyLineup]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveBattingStats(events as any, players, lineups);
    expect(stats.get('p1')?.plateAppearances).toBe(1);
    expect(stats.get('p9')?.plateAppearances).toBe(1);
    expect(stats.has('p3')).toBe(false);
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
