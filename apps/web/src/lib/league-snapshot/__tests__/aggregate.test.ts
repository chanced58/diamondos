import { combinePlayerStats } from '../aggregate';

describe('combinePlayerStats', () => {
  it('merges batting, pitching, fielding maps into one row per player keyed by stat-catalog fields', () => {
    const batting = new Map([
      [
        'p1',
        {
          playerId: 'p1', playerName: 'A B', avg: 0.333, homeRuns: 2, plateAppearances: 30,
          hits: 10, doubles: 2, triples: 0, runs: 5, rbi: 7, walks: 4, obp: 0.4, slg: 0.5,
          ops: 0.9, qabPct: 0.5, hardHitPct: 0.3,
        } as any,
      ],
    ]);
    const pitching = new Map([
      ['p1', { playerId: 'p1', era: 2.5, whip: 1.1, strikeouts: 12, inningsPitchedOuts: 21 } as any],
    ]);
    const fielding = new Map();
    const teamOf = new Map([
      ['p1', { teamId: 't1', teamName: 'Reds', firstName: 'A', lastName: 'B', optOut: false }],
    ]);

    const rows = combinePlayerStats({ batting, pitching, fielding, teamOf, leagueId: 'L', season: 'Spring 2026' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      league_id: 'L', season: 'Spring 2026', player_id: 'p1', team_id: 't1',
      team_name: 'Reds', first_name: 'A', last_name: 'B', public_opt_out: false,
      plate_appearances: 30, innings_pitched_outs: 21,
    });
    expect(rows[0].stats).toMatchObject({ avg: 0.333, homeRuns: 2, era: 2.5, whip: 1.1, strikeoutsP: 12 });
  });

  it('skips players with no team attribution', () => {
    const batting = new Map([['ghost', { hits: 1 } as any]]);
    const rows = combinePlayerStats({
      batting, pitching: new Map(), fielding: new Map(), teamOf: new Map(), leagueId: 'L', season: 'S',
    });
    expect(rows).toHaveLength(0);
  });
});
