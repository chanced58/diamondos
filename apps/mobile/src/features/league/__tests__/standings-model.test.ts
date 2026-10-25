import type { StandingsTeamRow } from '@baseball/shared';
import { DEFAULT_STANDINGS_SORT, formatDiff, formatLast5, formatPct, formatStreak, nextStandingsSort, sortStandings } from '../standings-model';

const row = (name: string, overrides: Partial<StandingsTeamRow>): StandingsTeamRow => ({
  key: name, name, organization: null, teamId: null, isActive: false, isOpponent: false,
  wins: 0, losses: 0, ties: 0, pct: 0, rf: 0, ra: 0, diff: 0, gamesPlayed: 0, last5: [], streak: null,
  ...overrides,
});

describe('standings model', () => {
  it('should format the standings cells as the web does', () => {
    expect(formatPct({ pct: 2 / 3, gamesPlayed: 3 })).toBe('.667');
    expect(formatPct({ pct: 1, gamesPlayed: 2 })).toBe('1.000');
    expect(formatPct({ pct: 0, gamesPlayed: 0 })).toBe('—');
    expect([formatDiff(4), formatDiff(-2), formatDiff(0)]).toEqual(['+4', '-2', '0']);
    expect(formatStreak({ type: 'W', count: 3 })).toBe('W3');
    expect(formatStreak(null)).toBe('—');
    expect(formatLast5(['W', 'W', 'L'])).toBe('WWL');
  });

  it('should rank by win percentage, ties to more wins, with teams yet to play last', () => {
    const rows = [
      row('Unplayed', {}),
      row('Half', { wins: 1, losses: 1, pct: 0.5, gamesPlayed: 2 }),
      row('Half, more wins', { wins: 2, losses: 2, pct: 0.5, gamesPlayed: 4 }),
      row('Best', { wins: 3, pct: 1, gamesPlayed: 3 }),
    ];
    expect(sortStandings(rows, DEFAULT_STANDINGS_SORT).map((r) => r.name)).toEqual(['Best', 'Half, more wins', 'Half', 'Unplayed']);
  });

  it('should never let wins outrank a better percentage', () => {
    const rows = [
      row('More wins, lower pct', { wins: 101, losses: 167, pct: 101 / 268, gamesPlayed: 268 }),
      row('Fewer wins, higher pct', { wins: 75, losses: 124, pct: 75 / 199, gamesPlayed: 199 }),
    ];
    expect(sortStandings(rows, DEFAULT_STANDINGS_SORT).map((r) => r.name)).toEqual(['Fewer wins, higher pct', 'More wins, lower pct']);
    expect(sortStandings(rows, { key: 'pct', ascending: true }).map((r) => r.name)).toEqual(['More wins, lower pct', 'Fewer wins, higher pct']);
  });

  it('should start losses and runs allowed low to high, and flip on a second tap', () => {
    expect(nextStandingsSort(DEFAULT_STANDINGS_SORT, 'ra')).toEqual({ key: 'ra', ascending: true });
    expect(nextStandingsSort(DEFAULT_STANDINGS_SORT, 'wins')).toEqual({ key: 'wins', ascending: false });
    expect(nextStandingsSort({ key: 'wins', ascending: false }, 'wins')).toEqual({ key: 'wins', ascending: true });

    const rows = [row('Cold', { streak: { type: 'L', count: 3 } }), row('Hot', { streak: { type: 'W', count: 2 } })];
    expect(sortStandings(rows, { key: 'streak', ascending: false }).map((r) => r.name)).toEqual(['Hot', 'Cold']);
  });
});
