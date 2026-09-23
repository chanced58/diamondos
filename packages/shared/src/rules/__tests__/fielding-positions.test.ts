import { validateFieldingPositions } from '../fielding-positions';
import { PlayerPosition } from '../../types/player';

describe('validateFieldingPositions', () => {
  it('rejects two right fielders in the batting order (production case)', () => {
    const result = validateFieldingPositions([
      { battingOrder: 8, position: PlayerPosition.RIGHT_FIELD },
      { battingOrder: 9, position: PlayerPosition.RIGHT_FIELD },
    ]);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual([
      { position: PlayerPosition.RIGHT_FIELD, battingOrders: [8, 9] },
    ]);
  });

  it('accepts a clean nine-position lineup', () => {
    const positions = [
      PlayerPosition.PITCHER,
      PlayerPosition.CATCHER,
      PlayerPosition.FIRST_BASE,
      PlayerPosition.SECOND_BASE,
      PlayerPosition.THIRD_BASE,
      PlayerPosition.SHORTSTOP,
      PlayerPosition.LEFT_FIELD,
      PlayerPosition.CENTER_FIELD,
      PlayerPosition.RIGHT_FIELD,
    ];
    const entries = positions.map((position, i) => ({ battingOrder: i + 1, position }));
    expect(validateFieldingPositions(entries)).toEqual({ valid: true, conflicts: [] });
  });

  it('allows a starting pitcher plus a bench pitcher with a null batting order', () => {
    // Bench pitchers are inserted with battingOrder: null so pitch counts
    // keep tracking them while a DH bats in their lineup slot. A rule that
    // considered null-battingOrder rows would reject this on every save.
    const result = validateFieldingPositions([
      { battingOrder: 1, position: PlayerPosition.DESIGNATED_HITTER },
      { battingOrder: 2, position: PlayerPosition.PITCHER },
      { battingOrder: null, position: PlayerPosition.PITCHER },
    ]);
    expect(result).toEqual({ valid: true, conflicts: [] });
  });

  it('allows two null positions — extra-hitter slots bat without fielding', () => {
    const result = validateFieldingPositions([
      { battingOrder: 9, position: null },
      { battingOrder: 10, position: null },
    ]);
    expect(result).toEqual({ valid: true, conflicts: [] });
  });

  it('allows two UTILITY (or INFIELD / OUTFIELD) entries — generic designations, not a unique spot', () => {
    expect(
      validateFieldingPositions([
        { battingOrder: 1, position: PlayerPosition.UTILITY },
        { battingOrder: 2, position: PlayerPosition.UTILITY },
      ]),
    ).toEqual({ valid: true, conflicts: [] });
    expect(
      validateFieldingPositions([
        { battingOrder: 1, position: PlayerPosition.INFIELD },
        { battingOrder: 2, position: PlayerPosition.INFIELD },
      ]),
    ).toEqual({ valid: true, conflicts: [] });
    expect(
      validateFieldingPositions([
        { battingOrder: 1, position: PlayerPosition.OUTFIELD },
        { battingOrder: 2, position: PlayerPosition.OUTFIELD },
      ]),
    ).toEqual({ valid: true, conflicts: [] });
  });

  it('rejects two designated hitters — a game has one DH', () => {
    const result = validateFieldingPositions([
      { battingOrder: 3, position: PlayerPosition.DESIGNATED_HITTER },
      { battingOrder: 4, position: PlayerPosition.DESIGNATED_HITTER },
    ]);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual([
      { position: PlayerPosition.DESIGNATED_HITTER, battingOrders: [3, 4] },
    ]);
  });

  it('lists all colliding batting orders when three entries share one position', () => {
    const result = validateFieldingPositions([
      { battingOrder: 5, position: PlayerPosition.SHORTSTOP },
      { battingOrder: 2, position: PlayerPosition.SHORTSTOP },
      { battingOrder: 9, position: PlayerPosition.SHORTSTOP },
    ]);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual([
      { position: PlayerPosition.SHORTSTOP, battingOrders: [2, 5, 9] },
    ]);
  });
});
