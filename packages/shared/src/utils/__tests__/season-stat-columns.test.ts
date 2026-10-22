import {
  battingTotals,
  formatSeasonStat,
  pitcherRestStatus,
  pitchingTotals,
  visibleBattingColumns,
  visiblePitchingColumns,
} from '../season-stat-columns';

const keys = (cols: { key: string }[]) => cols.map((c) => c.key);

describe('visible columns', () => {
  it('should show the free plan only counting stats and AVG for batting, ERA for pitching', () => {
    expect(keys(visibleBattingColumns('college', false))).not.toContain('obp');
    expect(keys(visibleBattingColumns('college', false))).toContain('avg');
    expect(keys(visiblePitchingColumns('college', false))).toEqual([
      'inningsPitchedOuts', 'totalPitches', 'era', 'hitsAllowed', 'walksAllowed', 'strikeouts', 'hitBatters', 'wildPitches',
    ]);
  });

  it('should narrow the columns by stat tier on a paid plan', () => {
    const youth = keys(visibleBattingColumns('youth', true));
    expect(youth).toEqual(['gamesAppeared', 'plateAppearances', 'atBats', 'runs', 'hits', 'rbi', 'walks', 'strikeouts', 'avg', 'obp', 'ops', 'hardHitPct']);
    expect(keys(visibleBattingColumns('college', true))).toHaveLength(26);
    expect(keys(visiblePitchingColumns('youth', true))).not.toContain('whip');
    expect(keys(visiblePitchingColumns('high_school', true))).toContain('whip');
  });
});

describe('formatSeasonStat', () => {
  it('should format each kind, and show missing values (null or NaN) as ---', () => {
    expect(formatSeasonStat(0.3333, 'rate')).toBe('.333');
    expect(formatSeasonStat(0.125, 'pct')).toBe('12.5%');
    expect(formatSeasonStat(4.5, 'dec')).toBe('4.50');
    expect(formatSeasonStat(10, 'ip')).toBe('3.1');
    expect(formatSeasonStat(7, 'int')).toBe('7');
    expect(formatSeasonStat(null, 'rate')).toBe('---');
    expect(formatSeasonStat(NaN, 'pct')).toBe('---');
    // isFinite(null) is true in JS; null must not read as zero.
    expect(formatSeasonStat(null, 'int')).toBe('---');
  });
});

describe('totals', () => {
  const batter = (over: Record<string, number | null> = {}) => ({
    gamesAppeared: 1, plateAppearances: 4, atBats: 3, runs: 1, hits: 1, doubles: 1, triples: 0, homeRuns: 0,
    rbi: 1, walks: 1, strikeouts: 1, hitByPitch: 0, sacrificeFlies: 0, sacrificeHits: 0,
    battedBalls: 2, hardHitBalls: 1, qab: 2, qabPct: 0.5, ...over,
  });

  it('should recompute batting rates from the summed counts, counting QAB only where tracked', () => {
    const totals = battingTotals([batter(), batter({ qabPct: null, qab: 0 })]);
    expect(totals).toMatchObject({ plateAppearances: 8, atBats: 6, hits: 2, walks: 2 });
    expect(totals.avg).toBeCloseTo(2 / 6);
    expect(totals.obp).toBeCloseTo(4 / 8);
    expect(totals.slg).toBeCloseTo(4 / 6);
    expect(totals.qabPct).toBeCloseTo(2 / 4);
  });

  it('should recompute pitching rates per 7 innings and leave rates empty with no outs', () => {
    const pitcher = { inningsPitchedOuts: 21, totalPitches: 100, strikes: 60, firstPitchStrikes: 12, totalPAs: 20,
      threeBallCountPAs: 4, threeZeroCountPAs: 1, hitsAllowed: 5, runsAllowed: 2, walksAllowed: 3, strikeouts: 7,
      hitBatters: 1, wildPitches: 0 };
    const totals = pitchingTotals([pitcher]);
    expect(totals.era).toBeCloseTo(2);
    expect(totals.whip).toBeCloseTo(8 / 7);
    expect(totals.strikePercentage).toBeCloseTo(0.6);
    expect(Number.isNaN(pitchingTotals([{ ...pitcher, inningsPitchedOuts: 0 }]).era)).toBe(true);
  });
});

describe('pitcherRestStatus', () => {
  it('should count rest days still owed from the last outing', () => {
    expect(pitcherRestStatus({ requiredRestDays: 3, canPitchNextDay: false, lastGameDate: '2026-10-20' }, '2026-10-21'))
      .toEqual({ eligible: false, daysRemaining: 2 });
    expect(pitcherRestStatus({ requiredRestDays: 3, canPitchNextDay: false, lastGameDate: '2026-10-17' }, '2026-10-21'))
      .toEqual({ eligible: true });
    expect(pitcherRestStatus({ requiredRestDays: 0, canPitchNextDay: false, lastGameDate: '2026-10-21' }, '2026-10-21'))
      .toEqual({ eligible: true });
    expect(pitcherRestStatus({ requiredRestDays: 2, canPitchNextDay: true, lastGameDate: '2026-10-21' }, '2026-10-21'))
      .toEqual({ eligible: true });
  });
});
