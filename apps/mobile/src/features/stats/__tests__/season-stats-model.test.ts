import type { OpponentBattingRow, SeasonBattingRow, SeasonPitcher } from '@baseball/shared';
import {
  CATCHER_COLUMNS,
  addDays,
  formatPlanDate,
  formatRecord,
  nextSort,
  opponentBattingTotals,
  pitcherSortValue,
  restLabel,
  seasonBattingColumns,
  seasonBattingTotals,
  seasonPitchingColumns,
  sortStatRows,
} from '../season-stats-model';

const TODAY = '2026-10-21';

function pitcher(id: string, over: Partial<SeasonPitcher> = {}): SeasonPitcher {
  return {
    playerId: id, playerName: id, gamesAppeared: 1, inningsPitchedOuts: 9, totalPitches: 50, strikes: 30, balls: 20,
    strikePercentage: 0.6, firstPitchStrikes: 5, firstPitchStrikePercentage: 0.5, threeBallCountPAs: 2,
    threeZeroCountPAs: 0, totalPAs: 10, threeBallCountPercentage: 0.2, threeZeroCountPercentage: 0, hitsAllowed: 3,
    runsAllowed: 1, earnedRunsAllowed: 1, walksAllowed: 1, strikeouts: 4, hitBatters: 0, wildPitches: 0, era: 2.33,
    whip: 1.33, strikeoutsPerSeven: 9.33, walksPerSeven: 2.33, baByCount: {}, compliance: null, ...over,
  };
}

function batter(id: string, over: Partial<SeasonBattingRow> = {}): SeasonBattingRow {
  return {
    playerId: id, playerName: id, gamesAppeared: 1, plateAppearances: 4, atBats: 4, runs: 0, hits: 1, doubles: 0,
    triples: 0, homeRuns: 0, rbi: 0, walks: 0, strikeouts: 1, hitByPitch: 0, sacrificeFlies: 0, sacrificeHits: 0,
    avg: 0.25, obp: 0.25, slg: 0.25, ops: 0.5, iso: 0, babip: 0.333, kPct: 0.25, bbPct: 0, woba: 0.2225,
    battedBalls: 3, hardHitBalls: 1, hardHitPct: 0.333, qab: 1, qabPct: 0.25, ...over,
  };
}

const resting = { pitchCount: 70, requiredRestDays: 3, canPitchNextDay: false, lastGameDate: '2026-10-20', pitches7d: 70 };

describe('columns', () => {
  it("should show the plan's and tier's columns and format missing rates as ---", () => {
    const columns = seasonBattingColumns('youth', true);
    expect(columns.map((c) => c.label)).toEqual(['G', 'PA', 'AB', 'R', 'H', 'RBI', 'BB', 'K', 'AVG', 'OBP', 'OPS', 'HHB%']);
    const avg = columns.find((c) => c.key === 'avg')!;
    expect(avg.value(batter('a'))).toBe('.250');
    expect(avg.value(batter('a', { avg: null }))).toBe('---');
    expect(seasonBattingColumns('college', false).map((c) => c.key)).not.toContain('obp');
  });

  it('should add rest and 7-day columns to pitching, highlighting a resting pitcher', () => {
    const columns = seasonPitchingColumns('high_school', true, TODAY);
    const rest = columns.find((c) => c.key === 'rest')!;
    const weekly = columns.find((c) => c.key === 'pitches7d')!;
    expect(rest.value(pitcher('a', { compliance: resting }))).toBe('2d');
    expect(rest.emphasize?.(pitcher('a', { compliance: resting }))).toBe(true);
    expect(rest.value(pitcher('b'))).toBe('—');
    expect(weekly.value(pitcher('a', { compliance: resting }))).toBe(70);
  });

  it('should total batting from the summed counts', () => {
    const totals = seasonBattingTotals([batter('a'), batter('b', { hits: 3, avg: 0.75 })], 'youth', true);
    expect(totals).toMatchObject({ plateAppearances: '8', hits: '4', avg: '.500' });
  });

  it('should show catcher innings per game and the last game as month/day', () => {
    const row = { playerId: 'c', playerName: 'C', totalInnings: 5.5, games: 2, lastGameDate: '2026-10-07' };
    expect(CATCHER_COLUMNS.map((c) => c.value(row))).toEqual(['5.50', 2, '2.75', '10/7']);
  });
});

describe('restLabel', () => {
  it('should say eligible, how many rest days remain, or that there is no outing', () => {
    expect(restLabel(resting, TODAY)).toEqual({ short: '2d', long: '2 more rest days required', resting: true });
    expect(restLabel({ ...resting, lastGameDate: '2026-10-19' }, TODAY).long).toBe('1 more rest day required');
    expect(restLabel({ ...resting, canPitchNextDay: true }, TODAY)).toMatchObject({ short: 'OK', resting: false });
    expect(restLabel(null, TODAY)).toMatchObject({ short: '—', resting: false });
  });
});

describe('sorting', () => {
  const name = (row: SeasonPitcher) => row.playerName;
  const value = (row: SeasonPitcher, key: string) => pitcherSortValue(row, key, TODAY);

  it('should sort high to low by default and keep missing values last either way', () => {
    const rows = [pitcher('a', { era: 3 }), pitcher('b', { era: null }), pitcher('c', { era: 1 })];
    expect(sortStatRows(rows, { key: 'era', ascending: false }, name, value).map(name)).toEqual(['a', 'c', 'b']);
    expect(sortStatRows(rows, { key: 'era', ascending: true }, name, value).map(name)).toEqual(['c', 'a', 'b']);
  });

  it('should sort by name and by rest days owed', () => {
    const rows = [pitcher('b', { compliance: resting }), pitcher('a'), pitcher('c', { compliance: { ...resting, canPitchNextDay: true } })];
    expect(sortStatRows(rows, { key: 'name', ascending: true }, name, value).map(name)).toEqual(['a', 'b', 'c']);
    expect(sortStatRows(rows, { key: 'rest', ascending: false }, name, value).map(name)).toEqual(['b', 'c', 'a']);
  });

  it('should flip a column tapped twice and start a new one high to low, names A to Z', () => {
    expect(nextSort({ key: 'era', ascending: false }, 'era')).toEqual({ key: 'era', ascending: true });
    expect(nextSort({ key: 'era', ascending: true }, 'whip')).toEqual({ key: 'whip', ascending: false });
    expect(nextSort({ key: 'era', ascending: false }, 'name')).toEqual({ key: 'name', ascending: true });
  });
});

describe('opponents', () => {
  it('should total opponent batting with on-base counting walks, hit batters and sac flies', () => {
    const row = (over: Partial<OpponentBattingRow>): OpponentBattingRow => ({
      playerId: 'x', playerName: 'X', pa: 4, ab: 3, r: 0, h: 1, doubles: 1, triples: 0, hr: 0, rbi: 0, bb: 1, k: 1,
      hbp: 0, sf: 0, sh: 0, sb: 0, cs: 0, avg: null, obp: null, slg: null, ops: null, ...over,
    });
    const totals = opponentBattingTotals([row({}), row({ bb: 0, hbp: 1 })]);
    expect(totals).toMatchObject({ pa: 8, ab: 6, h: 2, avg: '.333', obp: '.500', slg: '.667' });
  });

  it('should show a record with ties only when there are some', () => {
    expect(formatRecord({ wins: 3, losses: 1, ties: 0 })).toBe('3-1');
    expect(formatRecord({ wins: 3, losses: 1, ties: 1 })).toBe('3-1-1');
  });
});

describe('plan dates', () => {
  it('should step days across a month end and label a day without shifting zones', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(formatPlanDate('2026-10-24')).toBe('Sat, Oct 24');
  });
});
