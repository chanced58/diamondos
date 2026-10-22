import type { TeamComparisonRowWire } from '@baseball/shared';
import { COMPARISON_COLUMNS, comparisonSortValue } from '../league-model';
import { sortStatRows } from '../season-stats-model';

function team(id: string, over: Partial<TeamComparisonRowWire> = {}): TeamComparisonRowWire {
  return {
    teamId: id, teamName: id, isOpponentTeam: false, gamesPlayed: 4, wins: 2, losses: 2, ties: 0,
    runsScored: 20, runsAllowed: 18, teamAvg: 0.281, teamEra: 3.5, totalHits: 30, totalStrikeouts: 25, ...over,
  };
}

describe('team comparison', () => {
  it('should format each column like the web table', () => {
    const values = COMPARISON_COLUMNS.map((c) => c.value(team('a', { wins: 3, losses: 1 })));
    expect(values).toEqual([4, 3, 1, 0, '.750', 20, 18, '.281', '3.50', 30, 25]);
    expect(COMPARISON_COLUMNS.find((c) => c.key === 'pct')!.value(team('b', { wins: 0, losses: 0 }))).toBe('.000');
  });

  it('should sort by winning percentage, counting ties as games', () => {
    const rows = [team('a', { wins: 1, losses: 3 }), team('b', { wins: 3, losses: 1 }), team('c', { wins: 2, losses: 1, ties: 1 })];
    expect(sortStatRows(rows, { key: 'pct', ascending: false }, (r) => r.teamName, comparisonSortValue).map((r) => r.teamId))
      .toEqual(['b', 'c', 'a']);
    expect(comparisonSortValue(team('a'), 'teamEra')).toBe(3.5);
  });
});
