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
  it('uses the amateur bar (0.5 IP/game, 2.0 PA/game) for non-pro levels', () => {
    expect(DEFAULT_IP_PER_GAME).toBe(0.5);
    const hs = leaderQualifierMinimums(14, {}, 'high_school');
    expect(hs.ipOutsMin).toBe(21); // 0.5 IP/game * 14 games * 3 outs = 7.0 IP
    expect(hs.paMin).toBe(28); // 2.0 PA/game * 14
  });

  it('defaults to the amateur bar when level is missing/null', () => {
    expect(leaderQualifierMinimums(14).ipOutsMin).toBe(21);
    expect(leaderQualifierMinimums(14, {}, null).ipOutsMin).toBe(21);
    expect(leaderQualifierMinimums(14, {}, 'college').ipOutsMin).toBe(21);
  });

  it("uses the MLB qualified-player bar for level 'pro'", () => {
    const pro = leaderQualifierMinimums(14, {}, 'pro');
    expect(pro.ipOutsMin).toBe(42); // 1.0 IP/game * 14 * 3 = 14.0 IP
    expect(pro.paMin).toBeCloseTo(43.4); // 3.1 PA/game * 14
  });

  it('honors per-league overrides over the level default', () => {
    const { paMin, ipOutsMin } = leaderQualifierMinimums(14, { ipPerGame: 0.25, paPerGame: 1.0 }, 'pro');
    expect(ipOutsMin).toBeCloseTo(10.5); // override wins even for a pro league
    expect(paMin).toBe(14);
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

    const mlbBar = leaderQualifierMinimums(leagueGames, {}, 'pro').ipOutsMin;
    const hsBar = leaderQualifierMinimums(leagueGames, {}, 'high_school').ipOutsMin;

    const mlbBoard = buildLeaderboard(rows, getStatDef('era'), { minQualifier: mlbBar, limit: 10 });
    const hsBoard = buildLeaderboard(rows, getStatDef('era'), { minQualifier: hsBar, limit: 10 });

    expect(mlbBoard).toHaveLength(1); // the bug: a single pitcher
    expect(hsBoard).toHaveLength(4); // 58/35/33/24 outs all clear 21
    expect(hsBoard[0].value).toBe(0.6); // and the genuine ERA leader now surfaces
  });
});

describe('buildLeaderboard teamId passthrough', () => {
  it('preserves the optional teamId on ranked rows', () => {
    const rows: LeaderRow[] = [
      { id: 'p1', name: 'A', value: 0.4, qualifierValue: 30, teamName: 'Reds', teamId: 't1' },
      { id: 'p2', name: 'B', value: 0.3, qualifierValue: 30, teamName: 'Jays', teamId: 't2' },
    ];
    const ranked = buildLeaderboard(rows, getStatDef('avg'), { minQualifier: 0, limit: 10 });
    expect(ranked[0].teamId).toBe('t1');
    expect(ranked[1].teamId).toBe('t2');
  });
});
