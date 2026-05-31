import { buildLeaderboard, type LeaderRow } from '../league-leaderboard';
import { getStatDef } from '../../constants/stat-catalog';

const rows: LeaderRow[] = [
  { id: 'a', name: 'A', value: 0.400, qualifierValue: 1 },
  { id: 'b', name: 'B', value: 0.350, qualifierValue: 30 },
  { id: 'c', name: 'C', value: 0.350, qualifierValue: 30 },
  { id: 'd', name: 'D', value: 0.300, qualifierValue: 30 },
];

describe('buildLeaderboard', () => {
  it('filters below-qualifier rows for rate stats and ranks desc', () => {
    const out = buildLeaderboard(rows, getStatDef('avg'), { minQualifier: 10, limit: 10 });
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'd']);
    expect(out[0].rank).toBe(1);
  });
  it('assigns tied ranks (1,1,3 style) on equal values', () => {
    const out = buildLeaderboard(rows, getStatDef('avg'), { minQualifier: 10, limit: 10 });
    expect(out[0].rank).toBe(1); expect(out[1].rank).toBe(1); expect(out[2].rank).toBe(3);
  });
  it('sorts asc for asc-direction stats (ERA: lower is better)', () => {
    const eraRows: LeaderRow[] = [
      { id: 'x', name: 'X', value: 1.5, qualifierValue: 20 },
      { id: 'y', name: 'Y', value: 3.0, qualifierValue: 20 },
    ];
    const out = buildLeaderboard(eraRows, getStatDef('era'), { minQualifier: 0, limit: 10 });
    expect(out.map((r) => r.id)).toEqual(['x', 'y']);
  });
  it('respects limit', () => {
    const out = buildLeaderboard(rows, getStatDef('avg'), { minQualifier: 10, limit: 2 });
    expect(out).toHaveLength(2);
  });
});
