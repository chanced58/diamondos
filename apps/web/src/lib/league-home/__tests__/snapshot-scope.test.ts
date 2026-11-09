/**
 * The league home and team page against a fake Supabase client: checks which
 * player snapshot scope each one reads — leaderboards the whole-season line,
 * the team page the line for that team.
 */
type Row = Record<string, unknown>;

const mockTables: Record<string, Row[]> = {};
const mockCalls: Array<{ table: string; eq: Record<string, unknown> }> = [];

function mockBuilder(table: string) {
  const call: (typeof mockCalls)[number] = { table, eq: {} };
  mockCalls.push(call);
  let single = false;
  const result = () => {
    const rows = (mockTables[table] ?? []).filter((r) => Object.entries(call.eq).every(([k, v]) => r[k] === v));
    return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
  };
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => ((call.eq[col] = val), b),
    in: () => b,
    is: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: () => ((single = true), b),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return b;
}

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => mockBuilder(t) }) }));

import { getLeagueHomeData } from '../load';
import { getTeamStatPageData } from '../team-load';

const LEAGUE = {
  id: 'L1', slug: 'lg', name: 'League', visibility: 'public', current_season: '2027',
  level: null, home_theme: {}, leader_config: {}, logo_url: null,
};

const standing = (team_id: string, team_name: string) => ({
  league_id: 'L1', season: '2027', team_id, team_name, opponent_team_id: null, division_id: null,
  wins: 5, losses: 5, ties: 0, win_pct: 0.5, runs_for: 0, runs_against: 0,
});

/** t1 was traded from the Owls to the Hawks: a line per team and one season line under the Hawks. */
const snap = (scope: string, team_id: string, team_name: string, plate_appearances: number) => ({
  league_id: 'L1', season: '2027', scope, player_id: 't1', first_name: 'Tia', last_name: 'Traded',
  public_opt_out: false, team_id, team_name, stats: { avg: 0.5 }, plate_appearances, innings_pitched_outs: 0,
});

beforeEach(() => {
  mockCalls.length = 0;
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockTables.leagues = [LEAGUE];
  mockTables.league_standings_snapshot = [standing('hawks', 'Hawks'), standing('owls', 'Owls')];
  mockTables.league_player_stat_snapshot = [
    snap('team', 'owls', 'Owls', 12),
    snap('team', 'hawks', 'Hawks', 18),
    snap('season', 'hawks', 'Hawks', 30),
  ];
  mockTables.teams = [{ id: 'owls', name: 'Owls', logo_url: null }];
});

describe('player snapshot scope', () => {
  it("should rank the league's leaders on each player's whole-season line", async () => {
    const result = await getLeagueHomeData('lg', true, '2027');
    if (!('ok' in result)) throw new Error('expected data');
    const playerRead = mockCalls.find((c) => c.table === 'league_player_stat_snapshot');
    expect(playerRead?.eq).toEqual({ league_id: 'L1', season: '2027', scope: 'season' });
  });

  it("should show a team page the player's line for that team only", async () => {
    const result = await getTeamStatPageData('lg', 'owls', true, '2027');
    if (!('ok' in result)) throw new Error('expected data');
    const playerRead = mockCalls.find((c) => c.table === 'league_player_stat_snapshot');
    expect(playerRead?.eq).toEqual({ league_id: 'L1', season: '2027', scope: 'team', team_id: 'owls' });
    expect(result.players).toHaveLength(1);
    expect(result.players[0]).toMatchObject({ playerId: 't1', plateAppearances: 12 });
  });
});
