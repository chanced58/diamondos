import { deriveGameState, EventType, type GameEvent } from '@baseball/shared';
import {
  buildBattingOrderLineupRows,
  buildGameStartPayload,
  deriveLeadoffFromOrder,
  toggleBattingOrderSlot,
} from '../lineup-wizard';

/**
 * Coverage for Task 11 (lineup wizard writes a real batting order).
 *
 * The defect: the wizard asked for a leadoff batter directly and never wrote
 * `game_lineups`, so the order rail had zero rows and every batter after the
 * first had to be typed in by hand. The fix follows web's model
 * (apps/web/src/app/(app)/games/[gameId]/actions.ts:283): the order is the
 * source of truth, and the leadoff written into GAME_START is *derived* from
 * slot 1 of it — kept for backward compatibility because `deriveGameState`
 * (packages/shared/src/utils/game-state.ts:109) reads it, and games already
 * recorded in production depend on it.
 */

let seq = 0;
const resetSeq = () => {
  seq = 0;
};

function mkEvent(
  eventType: EventType,
  payload: Record<string, unknown>,
  overrides: Partial<GameEvent> = {},
): GameEvent {
  return {
    id: `evt-${seq}`,
    gameId: 'g1',
    sequenceNumber: seq++,
    eventType,
    inning: 1,
    isTopOfInning: true,
    payload,
    occurredAt: new Date(2026, 0, 1, 12, 0, seq).toISOString(),
    createdBy: 'user-1',
    deviceId: 'dev-1',
    ...overrides,
  };
}

describe('toggleBattingOrderSlot', () => {
  it('appends an unselected player to the end of the order', () => {
    expect(toggleBattingOrderSlot(['p1'], 'p2', 9)).toEqual(['p1', 'p2']);
  });

  it('removes an already-selected player, shifting later slots down', () => {
    expect(toggleBattingOrderSlot(['p1', 'p2', 'p3'], 'p1', 9)).toEqual(['p2', 'p3']);
  });

  it('respects getMaxBattingOrder: refuses to add a new player once the order is at the league cap', () => {
    const fullOrder = ['p1', 'p2', 'p3'];
    expect(toggleBattingOrderSlot(fullOrder, 'p4', 3)).toEqual(['p1', 'p2', 'p3']);
  });

  it('still allows removing a selected player even when the order is at the cap', () => {
    const fullOrder = ['p1', 'p2', 'p3'];
    expect(toggleBattingOrderSlot(fullOrder, 'p2', 3)).toEqual(['p1', 'p3']);
  });

  it('an expanded-lineup cap above nine allows a tenth player', () => {
    const nineDeep = Array.from({ length: 9 }, (_, i) => `p${i + 1}`);
    expect(toggleBattingOrderSlot(nineDeep, 'p10', 12)).toHaveLength(10);
  });
});

describe('deriveLeadoffFromOrder', () => {
  it('is slot 1 of the order', () => {
    expect(deriveLeadoffFromOrder(['leadoff-player', 'p2', 'p3'])).toBe('leadoff-player');
  });

  it('is null for an empty order', () => {
    expect(deriveLeadoffFromOrder([])).toBeNull();
  });
});

describe('buildGameStartPayload', () => {
  it('derives homeLeadoffBatterId from slot 1 when scoring the home team', () => {
    const payload = buildGameStartPayload({
      isHome: true,
      pitcherId: 'pitcher-1',
      battingOrder: ['leadoff-player', 'p2', 'p3'],
      tracking: { pitchType: true, pitchLocation: false },
    });
    expect(payload).toMatchObject({
      homeLineupPitcherId: 'pitcher-1',
      homeLeadoffBatterId: 'leadoff-player',
      pitchTypeEnabled: true,
      pitchLocationEnabled: false,
    });
    expect(payload).not.toHaveProperty('awayLineupPitcherId');
    expect(payload).not.toHaveProperty('awayLeadoffBatterId');
  });

  it('derives awayLeadoffBatterId from slot 1 when scoring the away team', () => {
    const payload = buildGameStartPayload({
      isHome: false,
      pitcherId: 'pitcher-1',
      battingOrder: ['leadoff-player', 'p2', 'p3'],
      tracking: { pitchType: false, pitchLocation: false },
    });
    expect(payload).toMatchObject({
      awayLineupPitcherId: 'pitcher-1',
      awayLeadoffBatterId: 'leadoff-player',
    });
    expect(payload).not.toHaveProperty('homeLineupPitcherId');
    expect(payload).not.toHaveProperty('homeLeadoffBatterId');
  });

  describe('backward compatibility with deriveGameState', () => {
    beforeEach(resetSeq);

    it('the top-of-1st pitcher and cached leadoff come straight off the payload', () => {
      // Exercises the real shared reducer — not a re-implementation of its
      // GAME_START handling — to pin that the payload this wizard now
      // builds still satisfies packages/shared/src/utils/game-state.ts:109,
      // the contract production games already depend on.
      const payload = buildGameStartPayload({
        isHome: true,
        pitcherId: 'pitcher-1',
        battingOrder: ['home-leadoff', 'p2', 'p3'],
        tracking: { pitchType: true, pitchLocation: true },
      });
      const state = deriveGameState('g1', [mkEvent(EventType.GAME_START, payload)], 'team-home');
      // Home pitches in the top of the 1st (away bats first).
      expect(state.currentPitcherId).toBe('pitcher-1');
      expect(state.homeLeadoffBatterId).toBe('home-leadoff');
    });

    it('restores currentBatterId to the derived leadoff on the half-inning transition (the original production bug)', () => {
      // This is the exact mechanism the web comment describes: without a
      // leadoff in the GAME_START payload, deriveGameState can't restore
      // currentBatterId on INNING_CHANGE, leaving it null and batting stats
      // unattributable from the second batter on. GAME_START here still
      // derives the leadoff from slot 1 of the order the wizard built.
      const payload = buildGameStartPayload({
        isHome: true,
        pitcherId: 'pitcher-1',
        battingOrder: ['home-leadoff', 'p2', 'p3'],
        tracking: { pitchType: true, pitchLocation: false },
      });
      const events = [
        mkEvent(EventType.GAME_START, payload),
        mkEvent(EventType.INNING_CHANGE, {}), // top of 1st ends -> bottom of 1st
      ];
      const state = deriveGameState('g1', events, 'team-home');
      expect(state.isTopOfInning).toBe(false);
      // Bottom of the 1st: the home team (our team) bats, restored from the
      // homeLeadoffBatterId this wizard derived off slot 1 of the order.
      expect(state.currentBatterId).toBe('home-leadoff');
    });
  });
});

describe('buildBattingOrderLineupRows', () => {
  it('builds one row per slot, 1-based, with the pitcher marked at their slot', () => {
    const rows = buildBattingOrderLineupRows('game-1', ['pitcher-1', 'p2', 'p3'], 'pitcher-1');
    expect(rows).toEqual([
      {
        gameRemoteId: 'game-1',
        playerRemoteId: 'pitcher-1',
        battingOrder: 1,
        startingPosition: 'pitcher',
        isStarter: true,
        isGuest: false,
        countTowardStats: true,
      },
      {
        gameRemoteId: 'game-1',
        playerRemoteId: 'p2',
        battingOrder: 2,
        startingPosition: null,
        isStarter: true,
        isGuest: false,
        countTowardStats: true,
      },
      {
        gameRemoteId: 'game-1',
        playerRemoteId: 'p3',
        battingOrder: 3,
        startingPosition: null,
        isStarter: true,
        isGuest: false,
        countTowardStats: true,
      },
    ]);
  });

  it('adds a bench row (null batting order) for a pitcher left out of the order — DH lineup', () => {
    const rows = buildBattingOrderLineupRows('game-1', ['p1', 'p2'], 'dh-pitcher');
    expect(rows).toHaveLength(3);
    const pitcherRow = rows.find((r) => r.playerRemoteId === 'dh-pitcher');
    expect(pitcherRow).toEqual({
      gameRemoteId: 'game-1',
      playerRemoteId: 'dh-pitcher',
      battingOrder: null,
      startingPosition: 'pitcher',
      isStarter: true,
      isGuest: false,
      countTowardStats: true,
    });
  });

  it('produces as many slots as the order has, up to the league cap the modal already enforced', () => {
    const nineDeep = Array.from({ length: 9 }, (_, i) => `p${i + 1}`);
    const rows = buildBattingOrderLineupRows('game-1', nineDeep, 'p1');
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.battingOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
