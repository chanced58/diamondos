/**
 * The league home for a league that schedules its own games, against a fake
 * Supabase client: recent and upcoming come from league_games, one row per game.
 */
type Row = Record<string, unknown>;

const mockTables: Record<string, Row[]> = {};

function mockBuilder(table: string) {
  const eq: Record<string, unknown> = {};
  const gte: Record<string, string> = {};
  const inList: Record<string, unknown[]> = {};
  let single = false;
  let head = false;
  let sortDir: 'asc' | 'desc' | null = null;
  let max = Infinity;
  const result = () => {
    let rows = (mockTables[table] ?? [])
      .filter((r) => Object.entries(eq).every(([k, v]) => r[k] === v))
      .filter((r) => Object.entries(gte).every(([k, v]) => (r[k] as string) >= v))
      .filter((r) => Object.entries(inList).every(([k, v]) => v.includes(r[k])));
    if (sortDir) {
      const dir = sortDir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)) * dir);
    }
    const count = rows.length;
    rows = rows.slice(0, max);
    if (head) return { data: null, count, error: null };
    return single ? { data: rows[0] ?? null, error: null } : { data: rows, count, error: null };
  };
  const b = {
    select: (_cols?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), b),
    eq: (col: string, val: unknown) => ((eq[col] = val), b),
    gte: (col: string, val: string) => ((gte[col] = val), b),
    in: (col: string, val: unknown[]) => ((inList[col] = val), b),
    is: () => b,
    order: (_col: string, o: { ascending: boolean }) => ((sortDir = o.ascending ? 'asc' : 'desc'), b),
    limit: (n: number) => ((max = n), b),
    maybeSingle: () => ((single = true), b),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return b;
}

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => mockBuilder(t) }) }));

import { getLeagueHomeData } from '../load';

const LEAGUE = {
  id: 'L1', slug: 'lg', name: 'League', visibility: 'public', current_season: '2027',
  level: null, home_theme: {}, leader_config: {}, logo_url: null, schedules_games: true,
};

const standing = (team_id: string, team_name: string) => ({
  league_id: 'L1', season: '2027', team_id, team_name, opponent_team_id: null, division_id: null,
  wins: 3, losses: 3, ties: 0, win_pct: 0.5, runs_for: 0, runs_against: 0,
});

const leagueGame = (id: string, season: string, status: string, scheduled_at: string, home_game_id: string | null = null) => ({
  id, league_id: 'L1', season, status, scheduled_at, time_zone: 'America/Chicago',
  home_team_id: 'owls', away_team_id: 'hawks', home_game_id,
});

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

beforeEach(() => {
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockTables.leagues = [LEAGUE];
  mockTables.league_standings_snapshot = [standing('hawks', 'Hawks'), standing('owls', 'Owls')];
  mockTables.teams = [{ id: 'owls', name: 'Owls' }, { id: 'hawks', name: 'Hawks' }];
  mockTables.games = [{ id: 'g-home', home_score: 5, away_score: 2 }];
  mockTables.league_games = [
    leagueGame('lg1', '2027', 'completed', past(3), 'g-home'),
    leagueGame('lg2', '2027', 'scheduled', future(2)),
    leagueGame('lg3', '2027', 'scheduled', past(1)),
    leagueGame('lg4', '2026', 'completed', past(300)),
    leagueGame('lg5', '2026', 'scheduled', future(5)),
  ];
});

async function load() {
  const data = await getLeagueHomeData('lg', false);
  if (!('ok' in data)) throw new Error('league did not load');
  return data;
}

describe('league home for a league that schedules its games', () => {
  it('should list each league game once with both teams', async () => {
    const data = await load();
    expect(data.leagueGames?.recent).toEqual([
      {
        id: 'lg1', homeTeamId: 'owls', homeName: 'Owls', awayTeamId: 'hawks', awayName: 'Hawks',
        homeRuns: 5, awayRuns: 2, scheduledAt: expect.any(String), timeZone: 'America/Chicago',
      },
    ]);
    expect(data.leagueGames?.upcoming.map((g) => g.id)).toEqual(['lg2']);
    expect(data.leagueGames?.upcoming[0]).toMatchObject({ homeName: 'Owls', awayName: 'Hawks' });
    expect(data.leagueGames?.upcoming[0]).not.toHaveProperty('homeRuns');
    expect(data.recent).toEqual([]);
    expect(data.upcoming).toEqual([]);
  });

  it('should only list the selected season', async () => {
    const data = await load();
    const ids = [...(data.leagueGames?.recent ?? []), ...(data.leagueGames?.upcoming ?? [])].map((g) => g.id);
    expect(ids).not.toContain('lg4');
    expect(ids).not.toContain('lg5');
  });

  it('should count completed league games without halving', async () => {
    mockTables.league_games.push(leagueGame('lg6', '2027', 'completed', past(5)));
    const data = await load();
    expect(data.counters.games).toBe(2);
  });

  it('should keep the platform-team path for leagues that do not schedule games', async () => {
    mockTables.leagues = [{ ...LEAGUE, schedules_games: false }];
    const data = await load();
    expect(data.leagueGames).toBeNull();
    // 6 W+L+T across both teams, halved.
    expect(data.counters.games).toBe(6);
  });
});
