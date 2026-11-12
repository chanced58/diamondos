import {
  battingTotals,
  formatSeasonStat,
  pitcherRestStatus,
  pitcherRestStatusAt,
  PITCHING_SEASON_COLUMNS,
  pitchingSeasonColumns,
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

  it('should recompute pitching rates per 7 innings, ERA from earned runs, and leave rates empty with no outs', () => {
    const pitcher = { inningsPitchedOuts: 21, totalPitches: 100, strikes: 60, firstPitchStrikes: 12, totalPAs: 20,
      threeBallCountPAs: 4, threeZeroCountPAs: 1, hitsAllowed: 5, runsAllowed: 3, earnedRunsAllowed: 2, walksAllowed: 3,
      strikeouts: 7, hitBatters: 1, wildPitches: 0 };
    const totals = pitchingTotals([pitcher]);
    // Earned runs only, like each pitcher's own ERA: the unearned run doesn't count.
    expect(totals.era).toBeCloseTo(2);
    expect(totals.whip).toBeCloseTo(8 / 7);
    expect(totals.strikePercentage).toBeCloseTo(0.6);
    expect(Number.isNaN(pitchingTotals([{ ...pitcher, inningsPitchedOuts: 0 }]).era)).toBe(true);
  });

  it('should recompute the totals per 9 innings for an adult league', () => {
    const pitcher = { inningsPitchedOuts: 3, totalPitches: 20, strikes: 12, firstPitchStrikes: 2, totalPAs: 6,
      threeBallCountPAs: 1, threeZeroCountPAs: 0, hitsAllowed: 2, runsAllowed: 2, earnedRunsAllowed: 2, walksAllowed: 1,
      strikeouts: 3, hitBatters: 0, wildPitches: 0 };
    expect(pitchingTotals([pitcher]).era).toBeCloseTo(14);
    const totals = pitchingTotals([pitcher], 9);
    expect(totals.era).toBeCloseTo(18);
    expect(totals.strikeoutsPerSeven).toBeCloseTo(27);
    expect(totals.walksPerSeven).toBeCloseTo(9);
    expect(totals.whip).toBeCloseTo(3);
  });
});

describe('pitching column labels', () => {
  const label = (cols: { key: string; label: string }[], key: string) => cols.find((c) => c.key === key)?.label;

  it('should label the per-game rates K/7 and BB/7 by default, as for high school', () => {
    const cols = visiblePitchingColumns('college', true);
    expect(label(cols, 'strikeoutsPerSeven')).toBe('K/7');
    expect(label(cols, 'walksPerSeven')).toBe('BB/7');
    expect(cols).toEqual(PITCHING_SEASON_COLUMNS);
  });

  it('should label them K/9 and BB/9 in a league that plays nine innings', () => {
    const cols = visiblePitchingColumns('college', true, 9);
    expect(label(cols, 'strikeoutsPerSeven')).toBe('K/9');
    expect(label(cols, 'walksPerSeven')).toBe('BB/9');
    expect(cols.find((c) => c.key === 'era')?.title).toBe('Earned run average (per 9 innings)');
    expect(keys(cols)).toEqual(keys(pitchingSeasonColumns(7)));
  });
});

describe('pitcherRestStatusAt', () => {
  it("should count days in the outing's time zone, not UTC", () => {
    const owedTwo = { requiredRestDays: 2, canPitchNextDay: false, lastGameDate: '2026-10-20', timeZone: 'America/Phoenix' };
    // 9 PM Thursday in Phoenix is already Friday in UTC; the pitcher clears Friday.
    const thursdayNight = new Date('2026-10-23T04:00:00Z');
    expect(pitcherRestStatusAt(owedTwo, thursdayNight)).toEqual({ eligible: false, daysRemaining: 1 });
    expect(pitcherRestStatusAt({ ...owedTwo, timeZone: 'UTC' }, thursdayNight)).toEqual({ eligible: true });
  });
});

describe('pitcherRestStatus', () => {
  it('should count rest days still owed, clearing the day after the last one like the bullpen planner', () => {
    const owedTwo = { requiredRestDays: 2, canPitchNextDay: false, lastGameDate: '2026-10-20' };
    // Tuesday's outing: Wednesday and Thursday are rest, Friday is eligible.
    expect(pitcherRestStatus(owedTwo, '2026-10-20')).toEqual({ eligible: false, daysRemaining: 2 });
    expect(pitcherRestStatus(owedTwo, '2026-10-21')).toEqual({ eligible: false, daysRemaining: 2 });
    expect(pitcherRestStatus(owedTwo, '2026-10-22')).toEqual({ eligible: false, daysRemaining: 1 });
    expect(pitcherRestStatus(owedTwo, '2026-10-23')).toEqual({ eligible: true });
    expect(pitcherRestStatus({ ...owedTwo, lastGameDate: '2026-11-01' }, '2026-11-03'))
      .toEqual({ eligible: false, daysRemaining: 1 });
    expect(pitcherRestStatus({ requiredRestDays: 0, canPitchNextDay: false, lastGameDate: '2026-10-21' }, '2026-10-21'))
      .toEqual({ eligible: true });
    expect(pitcherRestStatus({ requiredRestDays: 2, canPitchNextDay: true, lastGameDate: '2026-10-21' }, '2026-10-21'))
      .toEqual({ eligible: true });
  });
});
