import type { BoxScoreBatter, BoxScoreFielder, BoxScorePitcher } from '@baseball/shared';
import {
  BATTING_COLUMNS,
  FIELDING_COLUMNS,
  battingTotals,
  fieldingTotals,
  formatEra,
  formatPercent,
  formatRate,
  pitchingTotals,
} from '../box-score-columns';

const batter = (over: Partial<BoxScoreBatter> = {}): BoxScoreBatter => ({
  playerId: 'p', name: 'P', ab: 4, r: 1, h: 2, doubles: 1, triples: 0, hr: 0, rbi: 1, bb: 0, k: 1, sb: 0, avg: 0.5, ...over,
});

describe('formatting', () => {
  it('should format rates as baseball reads them, and missing rates as ---', () => {
    expect(formatRate(0.3333)).toBe('.333');
    expect(formatRate(1)).toBe('1.000');
    expect(formatRate(0)).toBe('.000');
    expect(formatRate(null)).toBe('---');
    expect(formatEra(4.5)).toBe('4.50');
    expect(formatEra(null)).toBe('---');
    expect(formatPercent(0.625)).toBe('63%');
    expect(formatPercent(null)).toBe('---');
  });
});

describe('batting', () => {
  it('should show a missing average as ---', () => {
    const avg = BATTING_COLUMNS.find((c) => c.key === 'avg')!;
    expect(avg.value(batter({ ab: 0, avg: null }))).toBe('---');
  });

  it('should total the team, with team AVG from the summed hits and at-bats', () => {
    const totals = battingTotals([batter(), batter({ ab: 2, h: 0, doubles: 0, sb: 2 })]);
    expect(totals).toMatchObject({ ab: 6, h: 2, doubles: 1, sb: 2, avg: '.333' });
  });
});

describe('pitching', () => {
  it('should total innings in thirds', () => {
    const pitcher = (outs: number): BoxScorePitcher => ({
      playerId: String(outs), name: 'P', battersFaced: 5, inningsPitchedOuts: outs, h: 1, r: 0, er: 0, bb: 0,
      k: 1, hbp: 0, wp: 0, pitches: 20, strikePct: 0.6, threeZeroCounts: 0, era: 0,
    });
    // 5 outs + 4 outs = 9 outs = 3.0 innings.
    expect(pitchingTotals([pitcher(5), pitcher(4)])).toMatchObject({ ip: '3.0', pc: 40, k: 2 });
  });
});

describe('fielding', () => {
  const fielder = (po: number, a: number, e: number): BoxScoreFielder => ({ playerId: `${po}${a}${e}`, name: 'F', position: 'SS', po, a, e });

  it('should flag errors and compute fielding percentage', () => {
    const errors = FIELDING_COLUMNS.find((c) => c.key === 'e')!;
    const fpct = FIELDING_COLUMNS.find((c) => c.key === 'fpct')!;
    expect(errors.emphasize?.(fielder(3, 1, 1))).toBe(true);
    expect(errors.emphasize?.(fielder(3, 1, 0))).toBe(false);
    expect(fpct.value(fielder(3, 1, 1))).toBe('.800');
    expect(fpct.value(fielder(0, 0, 0))).toBe('---');
    expect(fieldingTotals([fielder(3, 1, 1), fielder(2, 0, 0)])).toEqual({ po: 5, a: 1, e: 1, fpct: '.857' });
  });
});
