import { ZONE_MAP, INNER_ZONES, isInnerZone, flatZones, rowColForZone } from '../strike-zone';

describe('isInnerZone', () => {
  it('is true for all 9 inner (strike zone) zones', () => {
    for (const z of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(isInnerZone(z)).toBe(true);
    }
  });

  it('is false for outer-ring zones', () => {
    for (const z of [10, 14, 21, 25]) {
      expect(isInnerZone(z)).toBe(false);
    }
  });

  it('is false for out-of-range zone numbers', () => {
    expect(isInnerZone(0)).toBe(false);
    expect(isInnerZone(26)).toBe(false);
    expect(isInnerZone(-1)).toBe(false);
  });

  it('INNER_ZONES has exactly 9 members', () => {
    expect(INNER_ZONES.size).toBe(9);
  });
});

describe('flatZones', () => {
  it('has 25 entries with no duplicates', () => {
    const zones = flatZones();
    expect(zones).toHaveLength(25);
    expect(new Set(zones).size).toBe(25);
  });

  it('matches the expected row-major order', () => {
    expect(flatZones()).toEqual([
      10, 11, 12, 13, 14,
      15, 1, 2, 3, 16,
      17, 4, 5, 6, 18,
      19, 7, 8, 9, 20,
      21, 22, 23, 24, 25,
    ]);
  });
});

describe('rowColForZone', () => {
  it('round-trips for every zone 1-25 (ZONE_MAP[row][col] === zone)', () => {
    for (let zone = 1; zone <= 25; zone++) {
      const rc = rowColForZone(zone);
      expect(rc).not.toBeNull();
      expect(ZONE_MAP[rc!.row][rc!.col]).toBe(zone);
    }
  });

  it('returns null for an invalid zone', () => {
    expect(rowColForZone(0)).toBeNull();
    expect(rowColForZone(26)).toBeNull();
    expect(rowColForZone(-5)).toBeNull();
  });
});
