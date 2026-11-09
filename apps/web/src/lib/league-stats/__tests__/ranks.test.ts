import { BATTING_COLUMNS, PITCHING_COLUMNS, CARD_KEYS, parseTab } from '../columns';
import { computeRankTable, type StatsPlayer } from '../ranks';

const mins = { paMin: 10, ipOutsMin: 9 };

function p(over: Partial<StatsPlayer> & { playerId: string }): StatsPlayer {
  return {
    name: over.playerId, teamId: 'hawks', teamName: 'Hawks', pa: 20, ipOuts: 0,
    stats: {}, mine: false, ourTeam: false, ...over,
  };
}
const bat = (playerId: string, avg: number, hr: number, extra: Partial<StatsPlayer> = {}) =>
  p({ playerId, stats: { avg, homeRuns: hr }, ...extra });

describe('computeRankTable', () => {
  it('ranks AVG league-wide and within team, excluding unqualified', () => {
    const players = [
      bat('a', 0.4, 1, { teamId: 'hawks' }),
      bat('b', 0.3, 2, { teamId: 'hawks', pa: 5 }),
      bat('c', 0.35, 3, { teamId: 'owls', teamName: 'Owls' }),
      bat('d', 0.2, 4, { teamId: 'owls', teamName: 'Owls' }),
    ];
    const t = computeRankTable(players, BATTING_COLUMNS, 'batting', mins);
    expect(t.avg.b).toEqual({ league: null, leagueOf: 3, team: null, teamOf: 1 });
    expect(t.avg.a).toEqual({ league: 1, leagueOf: 3, team: 1, teamOf: 1 });
    expect(t.avg.c).toEqual({ league: 2, leagueOf: 3, team: 1, teamOf: 2 });
    expect(t.avg.d).toEqual({ league: 3, leagueOf: 3, team: 2, teamOf: 2 });
  });

  it('ranks ERA lower-is-better and ignores players with 0 IP', () => {
    const pit = (id: string, era: number, ipOuts: number) =>
      p({ playerId: id, pa: 0, ipOuts, stats: { era } });
    const t = computeRankTable(
      [pit('a', 5, 30), pit('b', 2, 30), pit('c', 1, 0)],
      PITCHING_COLUMNS, 'pitching', mins,
    );
    expect(t.era.b.league).toBe(1);
    expect(t.era.a.league).toBe(2);
    expect(t.era.c).toEqual({ league: null, leagueOf: 2, team: null, teamOf: 2 });
  });

  it('counting stats (HR) rank everyone with PA > 0 regardless of paMin', () => {
    const t = computeRankTable(
      [bat('a', 0.1, 1, { pa: 1 }), bat('b', 0.1, 5, { pa: 30 }), bat('c', 0.1, 9, { pa: 0 })],
      BATTING_COLUMNS, 'batting', mins,
    );
    expect(t.homeRuns.b.league).toBe(1);
    expect(t.homeRuns.a.league).toBe(2);
    expect(t.homeRuns.c.league).toBeNull();
    expect(t.homeRuns.a.leagueOf).toBe(2);
  });

  it('ties share a rank', () => {
    const t = computeRankTable(
      [bat('a', 0.1, 5), bat('b', 0.1, 5), bat('c', 0.1, 2)],
      BATTING_COLUMNS, 'batting', mins,
    );
    expect([t.homeRuns.a.league, t.homeRuns.b.league, t.homeRuns.c.league]).toEqual([1, 1, 3]);
  });

  it('ranks the PA lead column descending', () => {
    const t = computeRankTable([bat('a', 0.1, 0, { pa: 12 }), bat('b', 0.1, 0, { pa: 30 })], BATTING_COLUMNS, 'batting', mins);
    expect(t.pa.b.league).toBe(1);
    expect(t.pa.a.league).toBe(2);
  });
});

describe('columns', () => {
  it('parseTab falls back to batting', () => {
    expect(parseTab('nope')).toBe('batting');
    expect(parseTab(undefined)).toBe('batting');
    expect(parseTab('teams')).toBe('teams');
    expect(parseTab('pitching')).toBe('pitching');
  });
  it('exposes card keys and lead columns', () => {
    expect(CARD_KEYS.batting).toEqual(['avg', 'obp', 'homeRuns', 'rbi']);
    expect(CARD_KEYS.pitching).toEqual(['era', 'whip', 'strikeoutsP', 'ip']);
    expect(BATTING_COLUMNS[0].key).toBe('pa');
    expect(PITCHING_COLUMNS[0].key).toBe('ip');
  });
});
