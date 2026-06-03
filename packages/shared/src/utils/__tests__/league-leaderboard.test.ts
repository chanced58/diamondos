import {
  buildLeaderboard,
  leaderQualifierMinimums,
  DEFAULT_IP_PER_GAME,
  type LeaderRow,
} from '../league-leaderboard';
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
  it('does not apply the qualifier filter to counting (non-rate) stats', () => {
    const hrRows: LeaderRow[] = [
      { id: 'a', name: 'A', value: 5, qualifierValue: 1 }, // tiny qualifier, must still rank
      { id: 'b', name: 'B', value: 3, qualifierValue: 1 },
    ];
    const out = buildLeaderboard(hrRows, getStatDef('homeRuns'), { minQualifier: 100, limit: 10 });
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('leaderQualifierMinimums', () => {
  it('uses a HS-calibrated IP/game bar (0.5), not the MLB 1.0', () => {
    expect(DEFAULT_IP_PER_GAME).toBe(0.5);
    const { ipOutsMin } = leaderQualifierMinimums(14);
    expect(ipOutsMin).toBe(21); // 0.5 IP/game * 14 games * 3 outs = 7.0 IP
  });

  it('honors per-league overrides', () => {
    const { paMin, ipOutsMin } = leaderQualifierMinimums(14, { ipPerGame: 1.0, paPerGame: 3.1 });
    expect(ipOutsMin).toBe(42); // back to the MLB 1.0 IP/game bar = 14.0 IP
    expect(paMin).toBeCloseTo(43.4);
  });

  // Regression: Idaho 2A, Spring 2026 — 9 pitchers, league max 14 games. The old
  // 1.0 IP/game bar (42 outs) left only the 19.3-IP arm on the ERA board, hiding
  // the league's best ERA (0.60 over 11.7 IP). The 0.5 bar restores a real board.
  it('ERA board shows multiple pitchers at the HS bar, only one at the MLB bar', () => {
    const ipOuts = [58, 35, 33, 24, 15, 15, 11, 10, 2]; // real Idaho 2A innings-as-outs
    const era = [9.78, 0.6, 8.91, 14, 12.6, 12.6, 11.45, 33.6, 21];
    const rows: LeaderRow[] = ipOuts.map((outs, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      value: era[i],
      qualifierValue: outs,
    }));
    const leagueGames = 14;

    const mlbBar = leaderQualifierMinimums(leagueGames, { ipPerGame: 1.0 }).ipOutsMin;
    const hsBar = leaderQualifierMinimums(leagueGames).ipOutsMin;

    const mlbBoard = buildLeaderboard(rows, getStatDef('era'), { minQualifier: mlbBar, limit: 10 });
    const hsBoard = buildLeaderboard(rows, getStatDef('era'), { minQualifier: hsBar, limit: 10 });

    expect(mlbBoard).toHaveLength(1); // the bug: a single pitcher
    expect(hsBoard).toHaveLength(4); // 58/35/33/24 outs all clear 21
    expect(hsBoard[0].value).toBe(0.6); // and the genuine ERA leader now surfaces
  });
});
