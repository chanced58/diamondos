import { deriveFieldingStats, type FieldingLineupContext } from '../fielding-stats';
import { EventType } from '../../types/game-event';

type Evt = {
  game_id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  is_top_of_inning: boolean;
};

const GAME = 'g1';
let seq = 0;
const e = (event_type: string, payload: Record<string, unknown>, isTop = true): Evt => ({
  game_id: GAME,
  sequence_number: seq++,
  event_type,
  payload,
  is_top_of_inning: isTop,
});
const resetSeq = () => { seq = 0; };

const players = [
  { id: 'p-p', firstName: 'Paul', lastName: 'Pitcher' },       // position 1
  { id: 'p-c', firstName: 'Carl', lastName: 'Catcher' },       // position 2
  { id: 'p-1b', firstName: 'Frank', lastName: 'First' },       // position 3
  { id: 'p-2b', firstName: 'Sam', lastName: 'Second' },        // position 4
  { id: 'p-3b', firstName: 'Thad', lastName: 'Third' },        // position 5
  { id: 'p-ss', firstName: 'Steve', lastName: 'Short' },       // position 6
  { id: 'p-lf', firstName: 'Luke', lastName: 'Left' },         // position 7
  { id: 'p-cf', firstName: 'Chris', lastName: 'Center' },      // position 8
  { id: 'p-rf', firstName: 'Rob', lastName: 'Right' },         // position 9
  { id: 'p-sub', firstName: 'Subby', lastName: 'McSub' },
];

// We're the home team, so defense is the TOP of each inning.
const ourAlignment: FieldingLineupContext = {
  isHome: true,
  startingPositions: new Map<number, string>([
    [1, 'p-p'], [2, 'p-c'], [3, 'p-1b'], [4, 'p-2b'], [5, 'p-3b'],
    [6, 'p-ss'], [7, 'p-lf'], [8, 'p-cf'], [9, 'p-rf'],
  ]),
};

const ctxMap = () => new Map([[GAME, ourAlignment]]);

describe('deriveFieldingStats — simple out', () => {
  beforeEach(resetSeq);

  it('credits the last position in fieldingSequence with a putout and the rest with assists', () => {
    const events: Evt[] = [
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 4, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-ss')!.assists).toBe(1);
    expect(stats.get('p-2b')!.assists).toBe(1);
    expect(stats.get('p-1b')!.putouts).toBe(1);
    expect(stats.get('p-1b')!.assists).toBe(0);
  });

  it('credits an unassisted putout (single-position fieldingSequence) correctly', () => {
    const events: Evt[] = [
      e(EventType.OUT, { outType: 'flyout', fieldingSequence: [8] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-cf')!.putouts).toBe(1);
    expect(stats.get('p-cf')!.assists).toBe(0);
  });
});

describe('deriveFieldingStats — FIELD_ERROR', () => {
  beforeEach(resetSeq);

  it('charges the errorBy position with an error', () => {
    const events: Evt[] = [
      e(EventType.FIELD_ERROR, { errorBy: 6 }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-ss')!.errors).toBe(1);
  });
});

describe('deriveFieldingStats — DROPPED_THIRD_STRIKE', () => {
  beforeEach(resetSeq);

  it('credits fielders on a thrown_out D3K using the fieldingSequence', () => {
    const events: Evt[] = [
      e(EventType.DROPPED_THIRD_STRIKE, {
        outcome: 'thrown_out',
        fieldingSequence: [2, 3],
      }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-c')!.assists).toBe(1);
    expect(stats.get('p-1b')!.putouts).toBe(1);
  });

  it('charges an error on reached_on_error D3K', () => {
    const events: Evt[] = [
      e(EventType.DROPPED_THIRD_STRIKE, {
        outcome: 'reached_on_error',
        errorBy: 2,
      }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-c')!.errors).toBe(1);
  });
});

describe('deriveFieldingStats — DOUBLE_PLAY / TRIPLE_PLAY', () => {
  beforeEach(resetSeq);

  it('credits two putouts on a 6-4-3 double play', () => {
    const events: Evt[] = [
      e(EventType.DOUBLE_PLAY, { fieldingSequence: [6, 4, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    // 6 = assist (throws to 4), 4 = PO + A (gets force at 2nd, throws to 1st), 3 = PO
    expect(stats.get('p-ss')!.assists).toBe(1);
    expect(stats.get('p-2b')!.putouts).toBe(1);
    expect(stats.get('p-2b')!.assists).toBe(1);
    expect(stats.get('p-1b')!.putouts).toBe(1);
  });

  it('credits three putouts on a 5-4-3 triple play', () => {
    const events: Evt[] = [
      e(EventType.TRIPLE_PLAY, { fieldingSequence: [5, 4, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    // 5 = PO + A (stepped on 3rd, throws to 4), 4 = PO + A, 3 = PO
    expect(stats.get('p-3b')!.putouts).toBe(1);
    expect(stats.get('p-3b')!.assists).toBe(1);
    expect(stats.get('p-2b')!.putouts).toBe(1);
    expect(stats.get('p-2b')!.assists).toBe(1);
    expect(stats.get('p-1b')!.putouts).toBe(1);
  });
});

describe('deriveFieldingStats — CAUGHT_STEALING', () => {
  beforeEach(resetSeq);

  it('credits the catcher and fielder receiving the throw', () => {
    const events: Evt[] = [
      e('caught_stealing', {
        runnerId: 'runner1',
        fromBase: 1,
        toBase: 2,
        fieldingSequence: [2, 4],
      }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-c')!.assists).toBe(1);
    expect(stats.get('p-2b')!.putouts).toBe(1);
  });
});

describe('deriveFieldingStats — defensive half-inning filter', () => {
  beforeEach(resetSeq);

  it('ignores events during our batting half-inning (we are home, so bottom is our bat)', () => {
    const events: Evt[] = [
      // Bottom of inning — we're batting, NOT fielding
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 3] }, false),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    // Starters are seeded with gamesAppeared=1 regardless of half-inning,
    // but no PO/A/E should be credited for events during our bat.
    const totalChances = Array.from(stats.values()).reduce(
      (sum, s) => sum + s.putouts + s.assists + s.errors,
      0,
    );
    expect(totalChances).toBe(0);
  });

  it('credits events during our fielding half-inning when we are the visitor (top = bat)', () => {
    const visitorAlignment: FieldingLineupContext = {
      isHome: false,
      startingPositions: new Map<number, string>([[6, 'p-ss'], [3, 'p-1b']]),
    };
    const events: Evt[] = [
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 3] }, false),
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, new Map([[GAME, visitorAlignment]]));
    expect(stats.get('p-1b')!.putouts).toBe(1);
    expect(stats.get('p-ss')!.assists).toBe(1);
  });
});

describe('deriveFieldingStats — starter gamesAppeared', () => {
  beforeEach(resetSeq);

  it('marks every starter as appeared even when they record no PO/A/E', () => {
    // No fielding events at all — starters should still all have gamesAppeared=1.
    const stats = deriveFieldingStats([], players, ctxMap());
    for (const pid of ['p-p', 'p-c', 'p-1b', 'p-2b', 'p-3b', 'p-ss', 'p-lf', 'p-cf', 'p-rf']) {
      expect(stats.get(pid)?.gamesAppeared).toBe(1);
    }
    // The substitute never entered the game.
    expect(stats.get('p-sub')).toBeUndefined();
  });
});

describe('deriveFieldingStats — position tracking across substitutions', () => {
  beforeEach(resetSeq);

  it('uses the new fielder for their position after a defensive substitution', () => {
    const events: Evt[] = [
      e('substitution', {
        inPlayerId: 'p-sub',
        outPlayerId: 'p-ss',
        substitutionType: 'defensive',
        newPosition: 'SS',
      }, true),
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-sub')!.assists).toBe(1);
    expect(stats.get('p-ss')?.assists ?? 0).toBe(0);
  });

  it('ignores opponent substitutions so our position map is not overwritten', () => {
    const events: Evt[] = [
      e('substitution', {
        inPlayerId: 'opp-sub',
        outPlayerId: 'p-ss',
        substitutionType: 'defensive',
        newPosition: 'SS',
        isOpponentSubstitution: true,
      }, true),
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    // Our SS keeps the assist because opponent sub never touched our map.
    expect(stats.get('p-ss')!.assists).toBe(1);
    // Opponent player was never introduced — no stats row should exist.
    expect(stats.get('opp-sub')).toBeUndefined();
  });

  it('accepts long-form position names like "Shortstop" via normalization', () => {
    const events: Evt[] = [
      e('substitution', {
        inPlayerId: 'p-sub',
        outPlayerId: 'p-ss',
        substitutionType: 'defensive',
        newPosition: 'Shortstop',
      }, true),
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-sub')!.assists).toBe(1);
  });

  it('rotates the pitcher position on PITCHING_CHANGE', () => {
    const events: Evt[] = [
      e('pitching_change', { newPitcherId: 'p-sub', outgoingPitcherId: 'p-p' }, true),
      e(EventType.OUT, { outType: 'comeback', fieldingSequence: [1, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-sub')!.assists).toBe(1);
    expect(stats.get('p-p')?.assists ?? 0).toBe(0);
  });
});

describe('deriveFieldingStats — STRIKEOUT and sacrifice handling', () => {
  beforeEach(resetSeq);

  it('credits the catcher with a putout on a strikeout', () => {
    const events: Evt[] = [
      e(EventType.STRIKEOUT, { batterId: 'opp-b1' }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-c')!.putouts).toBe(1);
  });

  it('credits sacrifice bunt fielders like a regular out', () => {
    const events: Evt[] = [
      e(EventType.SACRIFICE_BUNT, { fieldingSequence: [1, 3] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-p')!.assists).toBe(1);
    expect(stats.get('p-1b')!.putouts).toBe(1);
  });
});

describe('deriveFieldingStats — derived fieldingPct', () => {
  beforeEach(resetSeq);

  it('computes fieldingPct = (PO + A) / (PO + A + E)', () => {
    const events: Evt[] = [
      // p-ss: 2 assists + 1 error
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 3] }, true),
      e(EventType.OUT, { outType: 'groundout', fieldingSequence: [6, 3] }, true),
      e(EventType.FIELD_ERROR, { errorBy: 6 }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    const ss = stats.get('p-ss')!;
    expect(ss.putouts).toBe(0);
    expect(ss.assists).toBe(2);
    expect(ss.errors).toBe(1);
    expect(ss.fieldingPct).toBeCloseTo(2 / 3, 5);
  });
});
