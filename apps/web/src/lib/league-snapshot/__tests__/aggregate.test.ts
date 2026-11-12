import { combinePlayerStats, standingRow, teamStatRow } from '../aggregate';

describe('combinePlayerStats', () => {
  it('merges batting, pitching, fielding maps into one row per player keyed by stat-catalog fields', () => {
    const batting = new Map([
      [
        'p1',
        {
          playerId: 'p1', playerName: 'A B', avg: 0.333, homeRuns: 2, plateAppearances: 30,
          hits: 10, doubles: 2, triples: 0, runs: 5, rbi: 7, walks: 4, obp: 0.4, slg: 0.5,
          ops: 0.9, qabPct: 0.5, hardHitPct: 0.3,
        },
      ],
    ]);
    const pitching = new Map([
      ['p1', { playerId: 'p1', era: 2.5, whip: 1.1, strikeouts: 12, inningsPitchedOuts: 21 }],
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
    const batting = new Map([['ghost', { hits: 1 }]]);
    const rows = combinePlayerStats({
      batting, pitching: new Map(), fielding: new Map(), teamOf: new Map(), leagueId: 'L', season: 'S',
    });
    expect(rows).toHaveLength(0);
  });
});

describe('teamStatRow', () => {
  const record = { wins: 1, losses: 0, ties: 0, runsFor: 5, runsAgainst: 2, winPct: 1 };
  const input = {
    leagueId: 'L', season: 'S', teamId: 't1', teamName: 'Hawks', record,
    batting: [{ hits: 3, atBats: 9 }],
    // 2 earned runs over one inning, split between two pitchers.
    pitching: [{ earnedRunsAllowed: 2, inningsPitchedOuts: 1 }, { earnedRunsAllowed: 0, inningsPitchedOuts: 2 }],
  };

  it('should calculate team ERA over 7 innings for a high-school league', () => {
    expect(teamStatRow({ ...input, statInnings: 7 }).stats.teamEra).toBe(14);
  });

  it('should calculate team ERA over 9 innings for an adult league', () => {
    expect(teamStatRow({ ...input, statInnings: 9 }).stats.teamEra).toBe(18);
  });
});

describe('standingRow', () => {
  const base = {
    leagueId: 'L', season: 'S', teamId: 't1', opponentTeamId: null, divisionId: null, teamName: 'Hawks',
    record: { wins: 2, losses: 0, ties: 0, runsFor: 9, runsAgainst: 3, winPct: 1 },
  };

  it('should carry the current streak', () => {
    expect(standingRow({ ...base, streak: 'W2' }).streak).toBe('W2');
  });

  it('should write an empty streak for a team without one', () => {
    expect(standingRow(base).streak).toBe('');
  });
});
