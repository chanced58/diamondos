import {
  battingStatsFromCounts,
  pitchingStatsFromCounts,
  fieldingStatsFromCounts,
} from '../historical-stats';

describe('battingStatsFromCounts', () => {
  it('sums counts across games and derives rates using the live formulas', () => {
    const stats = battingStatsFromCounts('p1', 'Ada Lovelace', 2, [
      { pa: 20, ab: 17, r: 5, h: 7, '2b': 2, '3b': 1, hr: 1, rbi: 6, bb: 2, so: 3, hbp: 1, sf: 0, sh: 0 },
      { pa: 20, ab: 17, r: 4, h: 7, '2b': 1, '3b': 0, hr: 1, rbi: 5, bb: 3, so: 3, hbp: 0, sf: 0, sh: 0 },
    ]);
    expect(stats.atBats).toBe(34);
    expect(stats.hits).toBe(14);
    expect(stats.doubles).toBe(3);
    expect(stats.avg).toBeCloseTo(14 / 34, 5);
    expect(stats.slg).toBeCloseTo(25 / 34, 5); // 8×1B + 3×2 + 1×3 + 2×4 = 25 TB
    expect(stats.obp).toBeCloseTo(0.5, 5); // (14+5+1)/(34+5+1+0)
    expect(stats.ops).toBeCloseTo(14 / 34 < 0 ? 0 : 25 / 34 + 0.5, 5);
    expect(stats.kPct).toBeCloseTo(6 / 40, 5);
    expect(stats.bbPct).toBeCloseTo(5 / 40, 5);
    expect(stats.woba).toBeCloseTo(20.92 / 40, 4);
    // Non-derivable fields render "---".
    expect(stats.qab).toBe(0);
    expect(Number.isNaN(stats.qabPct)).toBe(true);
  });

  it('returns NaN rates when there are no at-bats', () => {
    const stats = battingStatsFromCounts('p1', 'No PA', 1, [{ bb: 1 }]);
    expect(Number.isNaN(stats.avg)).toBe(true);
    expect(Number.isNaN(stats.slg)).toBe(true);
  });
});

describe('pitchingStatsFromCounts', () => {
  it('derives ERA/WHIP on a 7-inning basis', () => {
    const stats = pitchingStatsFromCounts('p1', 'Alan Turing', 1, [
      { ipOuts: 17, pitches: 80, strikes: 52, balls: 28, h: 6, r: 5, er: 4, bb: 2, so: 7, hbp: 1, wp: 0 },
    ]);
    const ip = 17 / 3;
    expect(stats.era).toBeCloseTo((4 * 7) / ip, 4);
    expect(stats.whip).toBeCloseTo((2 + 6) / ip, 4);
    expect(stats.strikeoutsPerSeven).toBeCloseTo((7 * 7) / ip, 4);
    expect(stats.strikePercentage).toBeCloseTo(52 / 80, 5);
  });

  it('uses Infinity ERA with zero innings', () => {
    const stats = pitchingStatsFromCounts('p1', 'x', 1, [{ er: 1 }]);
    expect(stats.era).toBe(Infinity);
    expect(stats.whip).toBe(Infinity);
  });
});

describe('fieldingStatsFromCounts', () => {
  it('derives fielding percentage', () => {
    const stats = fieldingStatsFromCounts('p1', 'x', 1, [{ po: 10, a: 5, e: 1 }]);
    expect(stats.fieldingPct).toBeCloseTo(15 / 16, 5);
  });
});
