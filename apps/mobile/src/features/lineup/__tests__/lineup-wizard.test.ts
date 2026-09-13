import { deriveGameState, EventType, type GameEvent } from '@baseball/shared';
import {
  buildBattingOrderLineupRows,
  buildGameStartPayload,
  deriveLeadoffFromOrder,
  planLineupReplacement,
  toggleBattingOrderSlot,
  type ExistingLineupRow,
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
      tracking: { pitchType: true, pitchLocation: false, hitLocation: false },
    });
    expect(payload).toMatchObject({
      homeLineupPitcherId: 'pitcher-1',
      homeLeadoffBatterId: 'leadoff-player',
      pitchTypeEnabled: true,
      pitchLocationEnabled: false,
      hitLocationEnabled: false,
    });
    expect(payload).not.toHaveProperty('awayLineupPitcherId');
    expect(payload).not.toHaveProperty('awayLeadoffBatterId');
  });

  it('writes hitLocationEnabled from the tracking choice', () => {
    const payload = buildGameStartPayload({
      isHome: false,
      pitcherId: 'pitcher-1',
      battingOrder: ['leadoff-player'],
      tracking: { pitchType: false, pitchLocation: false, hitLocation: true },
    });
    expect(payload).toMatchObject({ hitLocationEnabled: true });
  });

  it('derives awayLeadoffBatterId from slot 1 when scoring the away team', () => {
    const payload = buildGameStartPayload({
      isHome: false,
      pitcherId: 'pitcher-1',
      battingOrder: ['leadoff-player', 'p2', 'p3'],
      tracking: { pitchType: false, pitchLocation: false, hitLocation: false },
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
        tracking: { pitchType: true, pitchLocation: true, hitLocation: false },
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
        tracking: { pitchType: true, pitchLocation: false, hitLocation: false },
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

  describe('priorPositions (Important #2 — clobbered defensive positions)', () => {
    it('carries forward a returning player\'s existing starting_position instead of nulling it', () => {
      const rows = buildBattingOrderLineupRows(
        'game-1',
        ['pitcher-1', 'p2', 'p3'],
        'pitcher-1',
        new Map([
          ['p2', 'shortstop'],
          ['p3', 'center_field'],
        ]),
      );
      expect(rows.find((r) => r.playerRemoteId === 'p2')?.startingPosition).toBe('shortstop');
      expect(rows.find((r) => r.playerRemoteId === 'p3')?.startingPosition).toBe('center_field');
    });

    it('still nulls a player with no prior row — a newly-added starter legitimately has no position yet', () => {
      const rows = buildBattingOrderLineupRows(
        'game-1',
        ['pitcher-1', 'brand-new-player'],
        'pitcher-1',
        new Map([['p2', 'shortstop']]),
      );
      expect(rows.find((r) => r.playerRemoteId === 'brand-new-player')?.startingPosition).toBeNull();
    });

    it("this run's selected pitcher always gets 'pitcher', even if their prior row said otherwise", () => {
      const rows = buildBattingOrderLineupRows(
        'game-1',
        ['new-pitcher', 'p2'],
        'new-pitcher',
        new Map([['new-pitcher', 'first_base']]),
      );
      expect(rows.find((r) => r.playerRemoteId === 'new-pitcher')?.startingPosition).toBe('pitcher');
    });
  });
});

describe('planLineupReplacement', () => {
  const mkRow = (overrides: Partial<ExistingLineupRow>): ExistingLineupRow => ({
    playerRemoteId: 'unset',
    battingOrder: null,
    startingPosition: null,
    isGuest: false,
    ...overrides,
  });

  describe('Important #1 — guest-slot collision', () => {
    it('flags a collision when the wizard order would reclaim a guest\'s slot', () => {
      const existing = [mkRow({ playerRemoteId: 'guest-1', battingOrder: 1, isGuest: true })];
      const plan = planLineupReplacement(existing, 'game-1', ['starter-1', 'starter-2'], 'starter-1');
      expect(plan.guestSlotCollisions).toEqual([1]);
      expect(plan.rowsToDelete).toEqual([]);
      expect(plan.rowsToCreate).toEqual([]);
    });

    it('flags every colliding slot, not just the first', () => {
      const existing = [
        mkRow({ playerRemoteId: 'guest-1', battingOrder: 1, isGuest: true }),
        mkRow({ playerRemoteId: 'guest-2', battingOrder: 3, isGuest: true }),
      ];
      const plan = planLineupReplacement(
        existing,
        'game-1',
        ['s1', 's2', 's3'],
        's1',
      );
      expect(plan.guestSlotCollisions).toEqual([1, 3]);
    });

    it('no collision when the guest occupies a slot outside the wizard\'s order length', () => {
      const existing = [mkRow({ playerRemoteId: 'guest-1', battingOrder: 5, isGuest: true })];
      const plan = planLineupReplacement(existing, 'game-1', ['s1', 's2'], 's1');
      expect(plan.guestSlotCollisions).toEqual([]);
      expect(plan.rowsToCreate).toHaveLength(2);
    });

    it('no collision when there are no guests at all', () => {
      const plan = planLineupReplacement([], 'game-1', ['s1', 's2'], 's1');
      expect(plan.guestSlotCollisions).toEqual([]);
    });

    it('a benched guest (battingOrder null) never collides', () => {
      const existing = [mkRow({ playerRemoteId: 'guest-1', battingOrder: null, isGuest: true })];
      const plan = planLineupReplacement(existing, 'game-1', ['s1'], 's1');
      expect(plan.guestSlotCollisions).toEqual([]);
    });
  });

  describe('Important #2 — preserving defensive positions through the plan', () => {
    it('rowsToCreate preserves a returning starter\'s prior position', () => {
      const existing = [
        mkRow({ playerRemoteId: 'p1', battingOrder: 1, startingPosition: 'pitcher' }),
        mkRow({ playerRemoteId: 'p2', battingOrder: 2, startingPosition: 'shortstop' }),
      ];
      const plan = planLineupReplacement(existing, 'game-1', ['p1', 'p2'], 'p1');
      expect(plan.rowsToCreate.find((r) => r.playerRemoteId === 'p2')?.startingPosition).toBe(
        'shortstop',
      );
    });

    it('does not carry a stale pitcher tag onto a player who is no longer this run\'s pitcher', () => {
      const existing = [
        mkRow({ playerRemoteId: 'old-pitcher', battingOrder: 1, startingPosition: 'pitcher' }),
        mkRow({ playerRemoteId: 'new-pitcher', battingOrder: 2, startingPosition: 'first_base' }),
      ];
      const plan = planLineupReplacement(
        existing,
        'game-1',
        ['old-pitcher', 'new-pitcher'],
        'new-pitcher',
      );
      expect(plan.rowsToCreate.find((r) => r.playerRemoteId === 'old-pitcher')?.startingPosition).toBeNull();
      expect(plan.rowsToCreate.find((r) => r.playerRemoteId === 'new-pitcher')?.startingPosition).toBe(
        'pitcher',
      );
    });

    it('guest rows are excluded from rowsToDelete — the wizard must not touch them', () => {
      const existing = [
        mkRow({ playerRemoteId: 'guest-1', battingOrder: 9, isGuest: true }),
        mkRow({ playerRemoteId: 'p1', battingOrder: 1, startingPosition: 'pitcher' }),
      ];
      const plan = planLineupReplacement(existing, 'game-1', ['p1'], 'p1');
      expect(plan.rowsToDelete).toEqual([existing[1]]);
    });

    it('a brand-new lineup (no existing rows) plans cleanly with no positions to preserve', () => {
      const plan = planLineupReplacement([], 'game-1', ['p1', 'p2'], 'p1');
      expect(plan.guestSlotCollisions).toEqual([]);
      expect(plan.rowsToDelete).toEqual([]);
      expect(plan.rowsToCreate.map((r) => r.startingPosition)).toEqual(['pitcher', null]);
    });
  });
});
