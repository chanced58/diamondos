import {
  applyLineupSubstitutions,
  deriveDueBatter,
  battingOrderHistory,
  resolveDueBatter,
  attributePlayersForHalf,
  type BattingSlot,
} from '../due-batter';
import { EventType, SubstitutionType } from '../../types/game-event';

/** Build a 9-man lineup p1..p9 in batting order 1..9. */
function nineMan(): BattingSlot[] {
  return Array.from({ length: 9 }, (_, i) => ({
    playerId: `p${i + 1}`,
    battingOrder: i + 1,
  }));
}

/** Minimal substitution event for applyLineupSubstitutions. */
function sub(payload: Record<string, unknown>) {
  return { eventType: EventType.SUBSTITUTION, payload };
}

describe('deriveDueBatter', () => {
  it('cycles a 9-man lineup in order and wraps past the end', () => {
    const slots = nineMan();
    expect(deriveDueBatter(slots, 0)?.playerId).toBe('p1');
    expect(deriveDueBatter(slots, 3)?.playerId).toBe('p4');
    expect(deriveDueBatter(slots, 8)?.playerId).toBe('p9');
    // 9 completed PAs → back to the top of the order.
    expect(deriveDueBatter(slots, 9)?.playerId).toBe('p1');
    expect(deriveDueBatter(slots, 22)?.playerId).toBe('p5');
  });

  it('cycles non-contiguous batting orders by index, not slot number', () => {
    // Slot 4 removed — 8 batters at orders 1,2,3,5,6,7,8,9.
    const slots = nineMan().filter((s) => s.battingOrder !== 4);
    expect(deriveDueBatter(slots, 3)?.playerId).toBe('p5');
    // Wraps on 8, not 9.
    expect(deriveDueBatter(slots, 8)?.playerId).toBe('p1');
  });

  it('sorts unsorted input by battingOrder before cycling', () => {
    const slots = nineMan().reverse();
    expect(deriveDueBatter(slots, 0)?.playerId).toBe('p1');
    expect(deriveDueBatter(slots, 1)?.playerId).toBe('p2');
  });

  it('returns the batting order and index alongside the player id', () => {
    const due = deriveDueBatter(nineMan(), 4);
    expect(due).toEqual({ playerId: 'p5', battingOrder: 5, index: 4 });
  });

  it('returns null for an empty lineup', () => {
    expect(deriveDueBatter([], 3)).toBe(null);
  });
});

describe('applyLineupSubstitutions', () => {
  it('replaces a slot occupant on a pinch-hitter substitution', () => {
    const result = applyLineupSubstitutions(nineMan(), [
      sub({
        inPlayerId: 'sub1',
        outPlayerId: 'p3',
        substitutionType: SubstitutionType.PINCH_HITTER,
      }),
    ]);
    expect(result.find((s) => s.battingOrder === 3)?.playerId).toBe('sub1');
    expect(result).toHaveLength(9);
  });

  it('appends a new slot on a lineup extension and keeps order sorted', () => {
    const result = applyLineupSubstitutions(nineMan(), [
      sub({
        inPlayerId: 'p10',
        substitutionType: SubstitutionType.LINEUP_EXTENSION,
        battingOrderPosition: 10,
      }),
    ]);
    expect(result).toHaveLength(10);
    expect(result[9]).toMatchObject({ playerId: 'p10', battingOrder: 10 });
    // The new slot enters the rotation.
    expect(deriveDueBatter(result, 9)?.playerId).toBe('p10');
  });

  it('does not duplicate a lineup-extension slot that already exists', () => {
    const events = [
      sub({
        inPlayerId: 'p10',
        substitutionType: SubstitutionType.LINEUP_EXTENSION,
        battingOrderPosition: 10,
      }),
    ];
    const once = applyLineupSubstitutions(nineMan(), events);
    const twice = applyLineupSubstitutions(once, events);
    expect(twice).toHaveLength(10);
  });

  it('ignores position changes (no batting-order effect)', () => {
    const result = applyLineupSubstitutions(nineMan(), [
      sub({
        inPlayerId: 'p3',
        outPlayerId: 'p3',
        substitutionType: SubstitutionType.POSITION_CHANGE,
        newPosition: 'first_base',
      }),
    ]);
    expect(result).toEqual(nineMan());
  });

  it('filters substitutions by opponent flag', () => {
    const events = [
      sub({ inPlayerId: 'our-sub', outPlayerId: 'p1' }),
      sub({ inPlayerId: 'opp-sub', outPlayerId: 'p2', isOpponentSubstitution: true }),
    ];
    const ours = applyLineupSubstitutions(nineMan(), events);
    expect(ours.find((s) => s.battingOrder === 1)?.playerId).toBe('our-sub');
    expect(ours.find((s) => s.battingOrder === 2)?.playerId).toBe('p2'); // opponent sub skipped

    const theirs = applyLineupSubstitutions(nineMan(), events, { forOpponent: true });
    expect(theirs.find((s) => s.battingOrder === 1)?.playerId).toBe('p1');
    expect(theirs.find((s) => s.battingOrder === 2)?.playerId).toBe('opp-sub');
  });

  it('ignores non-substitution events and unknown outPlayerIds', () => {
    const result = applyLineupSubstitutions(nineMan(), [
      { eventType: EventType.HIT, payload: { batterId: 'p1', hitType: 'single' } },
      sub({ inPlayerId: 'x', outPlayerId: 'not-in-lineup' }),
    ]);
    expect(result).toEqual(nineMan());
  });

  it('chains substitutions — a sub can later be subbed out', () => {
    const result = applyLineupSubstitutions(nineMan(), [
      sub({ inPlayerId: 'sub1', outPlayerId: 'p5' }),
      sub({ inPlayerId: 'sub2', outPlayerId: 'sub1' }),
    ]);
    expect(result.find((s) => s.battingOrder === 5)?.playerId).toBe('sub2');
  });
});

describe('attributePlayersForHalf', () => {
  const OUR_IDS = new Set(['us1', 'us2', 'our-pitcher']);

  it.each([
    // [weAreHome, isTopOfInning, weBat]
    [true, false, true],   // home team bats in the bottom
    [true, true, false],   // home team fields in the top
    [false, true, true],   // away team bats in the top
    [false, false, false], // away team fields in the bottom
  ])('weAreHome=%s isTop=%s → weBat=%s', (weAreHome, isTopOfInning, weBat) => {
    const result = attributePlayersForHalf({
      weAreHome,
      isTopOfInning,
      ourBatterId: 'us1',
      ourPitcherId: 'our-pitcher',
      statePitcherId: weBat ? 'opp-p' : 'our-pitcher',
      stateBatterId: weBat ? 'us1' : 'opp-b',
      ourPlayerIds: OUR_IDS,
    });

    if (weBat) {
      expect(result).toEqual({ batterId: 'us1', opponentPitcherId: 'opp-p' });
    } else {
      expect(result).toEqual({ opponentBatterId: 'opp-b', pitcherId: 'our-pitcher' });
    }
  });

  it('uses ourPitcherId on our defensive half even when the state pitcher was reset (post inning change)', () => {
    // INNING_CHANGE resets gameState.currentPitcherId to null; our pitcher
    // must still be attributed from ourPitcherId (derived from the lineup /
    // pitching changes), otherwise pitches record no pitcher.
    const result = attributePlayersForHalf({
      weAreHome: true,
      isTopOfInning: true, // home fields in the top
      ourBatterId: null,
      ourPitcherId: 'our-pitcher',
      statePitcherId: null, // reset by inning change
      stateBatterId: 'opp-b',
      ourPlayerIds: OUR_IDS,
    });
    expect(result).toEqual({ opponentBatterId: 'opp-b', pitcherId: 'our-pitcher' });
  });

  it('omits the pitcher on our offensive half (we are not pitching)', () => {
    const result = attributePlayersForHalf({
      weAreHome: true,
      isTopOfInning: false,
      ourBatterId: 'us1',
      ourPitcherId: 'our-pitcher',
      statePitcherId: null,
      stateBatterId: 'us1',
      ourPlayerIds: OUR_IDS,
    });
    expect(result).toEqual({ batterId: 'us1' });
  });

  it('omits the opponent batter when the state id is one of ours (stale leak across a half)', () => {
    const result = attributePlayersForHalf({
      weAreHome: true,
      isTopOfInning: true,
      ourBatterId: null,
      ourPitcherId: 'our-pitcher',
      statePitcherId: 'our-pitcher',
      stateBatterId: 'us2', // stale leak from our previous offensive half
      ourPlayerIds: OUR_IDS,
    });
    expect(result).toEqual({ pitcherId: 'our-pitcher' });
  });

  it('sets the opponent pitcher on our offensive half only when the state id is not ours', () => {
    const result = attributePlayersForHalf({
      weAreHome: false,
      isTopOfInning: true, // away bats in the top
      ourBatterId: 'us1',
      ourPitcherId: 'our-pitcher',
      statePitcherId: 'opp-p',
      stateBatterId: 'us1',
      ourPlayerIds: OUR_IDS,
    });
    expect(result).toEqual({ batterId: 'us1', opponentPitcherId: 'opp-p' });
  });

  it('returns an empty attribution when nothing is known', () => {
    const result = attributePlayersForHalf({
      weAreHome: true,
      isTopOfInning: false,
      ourBatterId: null,
      ourPitcherId: null,
      statePitcherId: null,
      stateBatterId: null,
      ourPlayerIds: OUR_IDS,
    });
    expect(result).toEqual({});
  });
});

describe('deriveDueBatter — anchored on the last batter', () => {
  /** p1..p9 plus a mid-game addition at slot 10. */
  function tenMan(): BattingSlot[] {
    return [...nineMan(), { playerId: 'p10', battingOrder: 10 }];
  }

  it('should keep the rotation in place when a batter is added after the first time through', () => {
    // 12 completed PAs, p3 just batted. A PA-count modulo over the grown
    // order (12 % 10) would send p3 back up.
    expect(deriveDueBatter(tenMan(), 12, 3)?.playerId).toBe('p4');
    expect(deriveDueBatter(tenMan(), 17, 8)?.playerId).toBe('p9');
  });

  it('should send a mid-game addition up right after the old last slot', () => {
    expect(deriveDueBatter(tenMan(), 18, 9)?.playerId).toBe('p10');
  });

  it('should wrap to the top of the order after the last slot bats', () => {
    expect(deriveDueBatter(tenMan(), 19, 10)).toEqual({ playerId: 'p1', battingOrder: 1, index: 0 });
  });

  it('should skip no one when a batter is removed mid-game', () => {
    // Slot 4 removed after the first time through; p3 just batted.
    const slots = nineMan().filter((s) => s.battingOrder !== 4);
    expect(deriveDueBatter(slots, 12, 3)?.playerId).toBe('p5');
  });

  it('should follow a batter who hit out of order', () => {
    // Override put p6 up with only 2 PAs completed — p7 follows him.
    expect(deriveDueBatter(nineMan(), 2, 6)?.playerId).toBe('p7');
  });

  it('should bring each batter up when they are added just before their first PA', () => {
    const order: BattingSlot[] = [];
    for (let pa = 0; pa < 9; pa++) {
      order.push({ playerId: `p${pa + 1}`, battingOrder: pa + 1 });
      const lastOrder = pa === 0 ? null : pa;
      expect(deriveDueBatter(order, pa, lastOrder)?.playerId).toBe(`p${pa + 1}`);
    }
    // Nobody else added: the order turns over after p9.
    expect(deriveDueBatter(order, 9, 9)?.playerId).toBe('p1');
  });

  it('should fall back to the PA count when the last batter has no slot', () => {
    expect(deriveDueBatter(nineMan(), 12, null)?.playerId).toBe('p4');
    expect(deriveDueBatter(nineMan(), 12, undefined)?.playerId).toBe('p4');
  });
});

describe('battingOrderHistory', () => {
  it('should map every starter to their batting order', () => {
    const history = battingOrderHistory(nineMan(), []);
    expect(history.get('p1')).toBe(1);
    expect(history.get('p9')).toBe(9);
  });

  it('should keep a subbed-out player on the slot he batted from', () => {
    const history = battingOrderHistory(nineMan(), [
      sub({ inPlayerId: 'ph', outPlayerId: 'p3', substitutionType: SubstitutionType.PINCH_HITTER }),
    ]);
    expect(history.get('ph')).toBe(3);
    expect(history.get('p3')).toBe(3);
  });

  it('should give a lineup extension its new slot', () => {
    const history = battingOrderHistory(nineMan(), [
      sub({
        inPlayerId: 'p10',
        substitutionType: SubstitutionType.LINEUP_EXTENSION,
        battingOrderPosition: 10,
      }),
    ]);
    expect(history.get('p10')).toBe(10);
  });

  it('should only fold in substitutions for the requested side', () => {
    const events = [
      sub({ inPlayerId: 'our-sub', outPlayerId: 'p1' }),
      sub({ inPlayerId: 'opp-sub', outPlayerId: 'p2', isOpponentSubstitution: true }),
    ];
    expect(battingOrderHistory(nineMan(), events).has('opp-sub')).toBe(false);
    expect(battingOrderHistory(nineMan(), events, { forOpponent: true }).get('opp-sub')).toBe(2);
  });
});

describe('resolveDueBatter — when to ask "Who\'s up?"', () => {
  /** p1..pN in batting order 1..N. */
  function order(n: number): BattingSlot[] {
    return Array.from({ length: n }, (_, i) => ({ playerId: `p${i + 1}`, battingOrder: i + 1 }));
  }

  it('should ask when nobody is in the order yet', () => {
    expect(resolveDueBatter([], 0, null)).toEqual({ kind: 'ask', topOfOrder: null });
    expect(resolveDueBatter([], 3, null)).toEqual({ kind: 'ask', topOfOrder: null });
  });

  it('should bring up the next batter while a partial order still has batters left', () => {
    expect(resolveDueBatter(order(3), 0, null)).toEqual({ kind: 'due', playerId: 'p1', battingOrder: 1, index: 0 });
    expect(resolveDueBatter(order(3), 2, 2)).toMatchObject({ kind: 'due', playerId: 'p3' });
  });

  it('should ask, offering the top of the order, once the last batter of a partial order has batted', () => {
    expect(resolveDueBatter(order(5), 5, 5)).toEqual({
      kind: 'ask',
      topOfOrder: { playerId: 'p1', battingOrder: 1 },
    });
  });

  it('should ask after a partial order turns over even when the last batter has no slot', () => {
    // Fallback to the PA count: 5 PAs through a 5-man order lands on the top.
    expect(resolveDueBatter(order(5), 5, null)).toMatchObject({ kind: 'ask' });
  });

  it('should bring up a batter added after the last slot instead of asking', () => {
    expect(resolveDueBatter(order(6), 5, 5)).toMatchObject({ kind: 'due', playerId: 'p6' });
  });

  it('should wrap a complete nine-man order to the top without asking', () => {
    expect(resolveDueBatter(order(9), 9, 9)).toMatchObject({ kind: 'due', playerId: 'p1' });
    expect(resolveDueBatter(order(10), 10, 10)).toMatchObject({ kind: 'due', playerId: 'p1' });
  });
});
