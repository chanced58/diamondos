/**
 * getLeagueStatsData against a fake Supabase client: checks the season
 * predicates the loader sends, not just what assembleLeagueStats does with rows.
 */
type Row = Record<string, unknown>;

const mockTables: Record<string, Row[]> = {};
const mockCalls: Array<{ table: string; eq: Record<string, unknown>; range?: [number, number] }> = [];
let mockFailTable: string | null = null;

function mockBuilder(table: string) {
  const call: (typeof mockCalls)[number] = { table, eq: {} };
  mockCalls.push(call);
  let single = false;
  const result = () => {
    if (table === mockFailTable) return { data: null, error: { message: 'boom' } };
    let rows = (mockTables[table] ?? []).filter((r) => Object.entries(call.eq).every(([k, v]) => r[k] === v));
    if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
    return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
  };
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => ((call.eq[col] = val), b),
    order: () => b,
    range: (from: number, to: number) => ((call.range = [from, to]), b),
    maybeSingle: () => ((single = true), b),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return b;
}

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => mockBuilder(t) }) }));

import { getLeagueStatsData, PLAYER_SNAPSHOT_PAGE } from '../load';

const LEAGUE = {
  id: 'L1', slug: 'lg', name: 'League', visibility: 'public', current_season: '2026',
  level: null, home_theme: {}, leader_config: {},
};

const standing = (season: string, team_id: string, team_name: string) => ({
  league_id: 'L1', season, team_id, team_name, opponent_team_id: null, division_id: null,
  wins: 5, losses: 5, ties: 0, win_pct: 0.5, runs_for: 0, runs_against: 0,
});

const snap = (season: string, player_id: string, scope = 'season') => ({
  league_id: 'L1', season, scope, player_id, first_name: 'Alex', last_name: player_id, public_opt_out: false,
  team_id: 'reds', team_name: 'Reds', stats: { avg: 0.3 }, plate_appearances: 30, innings_pitched_outs: 0,
});

beforeEach(() => {
  mockCalls.length = 0;
  mockFailTable = null;
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockTables.leagues = [LEAGUE];
  mockTables.league_standings_snapshot = [standing('2026', 'reds', 'Reds'), standing('2025', 'reds', 'Reds')];
  mockTables.league_player_stat_snapshot = [snap('2026', 'p1'), snap('2025', 'p2')];
  mockTables.league_team_stat_snapshot = [];
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const viewer = { userId: null, activeTeam: null };

describe('getLeagueStatsData season handling', () => {
  it('filters every snapshot read by league and the requested season', async () => {
    const result = await getLeagueStatsData('lg', viewer, '2025');
    if (!('ok' in result)) throw new Error('expected data');
    expect(result.season).toBe('2025');
    expect(result.seasons).toEqual(['2026', '2025']);
    expect(result.players.map((p) => p.playerId)).toEqual(['p2']);
    const seasonReads = mockCalls.filter((c) => c.table !== 'leagues' && 'season' in c.eq);
    expect(seasonReads.map((c) => c.table).sort()).toEqual([
      'league_player_stat_snapshot',
      'league_standings_snapshot',
      'league_team_stat_snapshot',
    ]);
    for (const c of seasonReads) expect(c.eq).toMatchObject({ league_id: 'L1', season: '2025' });
  });

  it("should list each player's whole-season line, not their per-team lines", async () => {
    mockTables.league_player_stat_snapshot = [snap('2026', 'p1'), snap('2026', 'p1', 'team'), snap('2026', 'p3', 'team')];
    const result = await getLeagueStatsData('lg', viewer, '2026');
    if (!('ok' in result)) throw new Error('expected data');
    expect(result.players.map((p) => p.playerId)).toEqual(['p1']);
    const playerRead = mockCalls.find((c) => c.table === 'league_player_stat_snapshot');
    expect(playerRead?.eq).toEqual({ league_id: 'L1', season: '2026', scope: 'season' });
  });

  it('an unknown season returns empty players and teams', async () => {
    const result = await getLeagueStatsData('lg', viewer, '1999');
    if (!('ok' in result)) throw new Error('expected data');
    expect(result.season).toBe('1999');
    expect(result.players).toEqual([]);
    expect(result.teams).toEqual([]);
  });

  it('a failed season lookup throws instead of guessing a season', async () => {
    mockFailTable = 'league_standings_snapshot';
    await expect(getLeagueStatsData('lg', viewer)).rejects.toThrow('Failed to load league data');
  });

  it('pages through the player snapshot past the per-request row cap', async () => {
    const many = Array.from({ length: PLAYER_SNAPSHOT_PAGE + 5 }, (_, i) => snap('2026', `p${String(i).padStart(5, '0')}`));
    mockTables.league_player_stat_snapshot = many;
    const result = await getLeagueStatsData('lg', viewer, '2026');
    if (!('ok' in result)) throw new Error('expected data');
    expect(result.players).toHaveLength(PLAYER_SNAPSHOT_PAGE + 5);
    const pages = mockCalls.filter((c) => c.table === 'league_player_stat_snapshot').map((c) => c.range);
    expect(pages).toEqual([
      [0, PLAYER_SNAPSHOT_PAGE - 1],
      [PLAYER_SNAPSHOT_PAGE, 2 * PLAYER_SNAPSHOT_PAGE - 1],
    ]);
  });
});
