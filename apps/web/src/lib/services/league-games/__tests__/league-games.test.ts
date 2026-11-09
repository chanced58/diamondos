import { cancelLeagueGame, createLeagueGame, listLeagueGames, updateLeagueGame } from '../league-games';
import { fakeDb, type FakeResult } from '../../__tests__/fake-db';

const mockRefreshLeagueGame = jest.fn();
jest.mock('@/lib/league-games/refresh', () => ({
  refreshLeagueGame: (...args: unknown[]) => mockRefreshLeagueGame(...args),
}));

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const HOME = '22222222-2222-4222-8222-222222222222';
const AWAY = '33333333-3333-4333-8333-333333333333';
const HOME_ROSTER = '44444444-4444-4444-8444-444444444444';
const AWAY_ROSTER = '55555555-5555-4555-8555-555555555555';
const LEAGUE_GAME = '66666666-6666-4666-8666-666666666666';
const HOME_GAME = '77777777-7777-4777-8777-777777777777';
const AWAY_GAME = '88888888-8888-4888-8888-888888888888';

const staff = (role: string | null): FakeResult => ({
  data: role ? { role, leagues: { id: LEAGUE, name: 'Valley League' } } : null,
});

const input = { leagueId: LEAGUE, homeTeamId: HOME, awayTeamId: AWAY, date: '2026-11-10', time: '19:00', timeZone: 'America/Boise' };

function createFixture(overrides: Record<string, FakeResult | FakeResult[]> = {}) {
  return fakeDb({
    'league_staff.select': staff('league_admin'),
    'leagues.select': { data: { current_season: 'Spring 2027' } },
    'league_members.select': { data: [{ team_id: HOME }, { team_id: AWAY }] },
    'teams.select': { data: [{ id: HOME, name: 'Hawks' }, { id: AWAY, name: 'Bears' }] },
    'opponent_teams.select': {
      data: [
        { id: HOME_ROSTER, linked_team_id: HOME },
        { id: AWAY_ROSTER, linked_team_id: AWAY },
      ],
    },
    'seasons.select': { data: { id: 'season-1' } },
    'league_games.insert': { data: { id: LEAGUE_GAME } },
    'games.insert': [{ data: { id: HOME_GAME } }, { data: { id: AWAY_GAME } }],
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('createLeagueGame', () => {
  it('should create two paired team games pointing at each other\'s roster records', async () => {
    const { db, calls } = createFixture();
    expect(await createLeagueGame(db, 'u1', input)).toEqual({
      ok: true,
      data: { leagueGameId: LEAGUE_GAME, homeGameId: HOME_GAME, awayGameId: AWAY_GAME },
    });

    const inserts = calls.filter((c) => c.table === 'games' && c.op === 'insert').map((c) => c.payload);
    expect(inserts[0]).toMatchObject({
      team_id: HOME,
      location_type: 'home',
      scorer_side: 'home',
      opponent_team_id: AWAY_ROSTER,
      opponent_name: 'Bears',
      league_game_id: LEAGUE_GAME,
      paired_game_id: null,
    });
    expect(inserts[1]).toMatchObject({
      team_id: AWAY,
      location_type: 'away',
      scorer_side: 'away',
      opponent_team_id: HOME_ROSTER,
      opponent_name: 'Hawks',
      league_game_id: LEAGUE_GAME,
      paired_game_id: HOME_GAME,
    });
    const backLink = calls.find((c) => c.table === 'games' && c.op === 'update');
    expect(backLink?.payload).toEqual({ paired_game_id: AWAY_GAME });
    expect(backLink?.filters).toEqual({ id: HOME_GAME });
    expect(calls.find((c) => c.table === 'league_games' && c.op === 'update')?.payload).toEqual({
      home_game_id: HOME_GAME,
      away_game_id: AWAY_GAME,
    });
  });

  it('should store the start time in the given time zone', async () => {
    const { db, calls } = createFixture();
    await createLeagueGame(db, 'u1', input);
    // 19:00 in Boise (MST, UTC-7) on Nov 10 is 02:00 UTC the next day.
    expect(calls.find((c) => c.table === 'league_games' && c.op === 'insert')?.payload).toMatchObject({
      season: 'Spring 2027',
      scheduled_at: '2026-11-11T02:00:00.000Z',
      time_zone: 'America/Boise',
    });
  });

  it('should create the team season when it is missing', async () => {
    const { db, calls } = createFixture({
      'seasons.select': { data: null },
      'seasons.insert': { data: { id: 'new-season' } },
    });
    expect((await createLeagueGame(db, 'u1', input)).ok).toBe(true);
    const seasonInserts = calls.filter((c) => c.table === 'seasons' && c.op === 'insert');
    expect(seasonInserts).toHaveLength(2);
    expect(seasonInserts[0].payload).toEqual({
      team_id: HOME,
      name: 'Spring 2027',
      start_date: '2027-03-01',
      end_date: '2027-05-31',
      is_active: false,
    });
    expect(calls.find((c) => c.table === 'games' && c.op === 'insert')?.payload).toMatchObject({ season_id: 'new-season' });
  });

  it('should refuse a team that is not an active member', async () => {
    const { db, calls } = createFixture({ 'league_members.select': { data: [{ team_id: HOME }] } });
    expect(await createLeagueGame(db, 'u1', input)).toMatchObject({ ok: false, code: 'invalid' });
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('should ask for the current season when the league has none', async () => {
    const { db } = createFixture({ 'leagues.select': { data: { current_season: null } } });
    expect(await createLeagueGame(db, 'u1', input)).toEqual({
      ok: false,
      code: 'invalid',
      error: "Set the league's current season first.",
    });
  });

  it('should fail without creating a roster record when a team has none', async () => {
    const { db, calls } = createFixture({ 'opponent_teams.select': { data: [{ id: HOME_ROSTER, linked_team_id: HOME }] } });
    expect(await createLeagueGame(db, 'u1', input)).toMatchObject({ ok: false, code: 'failed' });
    expect(calls.some((c) => c.table === 'opponent_teams' && c.op === 'insert')).toBe(false);
  });

  it('should refuse a league manager', async () => {
    const { db } = createFixture({ 'league_staff.select': staff('league_manager') });
    expect(await createLeagueGame(db, 'u1', input)).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('should remove what it made when a later insert fails', async () => {
    const { db, calls } = createFixture({ 'games.insert': [{ data: { id: HOME_GAME } }, { error: { message: 'boom' } }] });
    expect(await createLeagueGame(db, 'u1', input)).toMatchObject({ ok: false, code: 'failed' });
    expect(calls.some((c) => c.table === 'games' && c.op === 'delete')).toBe(true);
    expect(calls.some((c) => c.table === 'league_games' && c.op === 'delete')).toBe(true);
  });
});

const existing = (status: string): FakeResult => ({
  data: {
    id: LEAGUE_GAME,
    league_id: LEAGUE,
    status,
    scheduled_at: '2026-11-11T02:00:00.000Z',
    time_zone: 'America/Boise',
    home_game_id: HOME_GAME,
    away_game_id: AWAY_GAME,
  },
});

describe('updateLeagueGame', () => {
  it('should apply the new time and venue to the league game and both team games', async () => {
    const { db, calls } = fakeDb({ 'league_games.select': existing('scheduled'), 'league_staff.select': staff('league_admin') });
    expect(await updateLeagueGame(db, 'u1', { leagueGameId: LEAGUE_GAME, time: '18:00', venueName: 'Field 2' })).toEqual({
      ok: true,
      data: { leagueGameId: LEAGUE_GAME },
    });
    const expected = { scheduled_at: '2026-11-11T01:00:00.000Z', time_zone: 'America/Boise', venue_name: 'Field 2' };
    expect(calls.find((c) => c.table === 'league_games' && c.op === 'update')?.payload).toEqual(expected);
    const gamesUpdate = calls.find((c) => c.table === 'games' && c.op === 'update');
    expect(gamesUpdate?.payload).toEqual(expected);
    expect(gamesUpdate?.filters).toEqual({ id: [HOME_GAME, AWAY_GAME] });
  });

  it('should refuse to edit a completed league game', async () => {
    const { db, calls } = fakeDb({ 'league_games.select': existing('completed'), 'league_staff.select': staff('league_admin') });
    expect(await updateLeagueGame(db, 'u1', { leagueGameId: LEAGUE_GAME, venueName: 'Field 2' })).toMatchObject({
      ok: false,
      code: 'conflict',
    });
    expect(calls.some((c) => c.op === 'update')).toBe(false);
  });
});

describe('cancelLeagueGame', () => {
  it('should cancel both team games', async () => {
    const { db, calls } = fakeDb({ 'league_games.select': existing('scheduled'), 'league_staff.select': staff('league_admin') });
    expect(await cancelLeagueGame(db, 'u1', { leagueGameId: LEAGUE_GAME })).toEqual({
      ok: true,
      data: { leagueGameId: LEAGUE_GAME },
    });
    expect(calls.find((c) => c.table === 'league_games' && c.op === 'update')?.payload).toEqual({ status: 'cancelled' });
    const gamesUpdate = calls.find((c) => c.table === 'games' && c.op === 'update');
    expect(gamesUpdate?.payload).toEqual({ status: 'cancelled' });
    expect(gamesUpdate?.filters).toEqual({ id: [HOME_GAME, AWAY_GAME] });
    expect(mockRefreshLeagueGame).not.toHaveBeenCalled();
  });

  it('should refresh the league when a completed league game is cancelled', async () => {
    const { db } = fakeDb({ 'league_games.select': existing('completed'), 'league_staff.select': staff('league_admin') });
    expect(await cancelLeagueGame(db, 'u1', { leagueGameId: LEAGUE_GAME })).toMatchObject({ ok: true });
    expect(mockRefreshLeagueGame).toHaveBeenCalledWith(db, LEAGUE_GAME, 'u1');
  });

  it('should hide a game from someone off the league staff', async () => {
    const { db } = fakeDb({ 'league_games.select': existing('scheduled'), 'league_staff.select': staff(null) });
    expect(await cancelLeagueGame(db, 'u1', { leagueGameId: LEAGUE_GAME })).toMatchObject({ code: 'not_found' });
  });
});

describe('listLeagueGames', () => {
  it('should list games with runs, manual-result and settling flags', async () => {
    const row = (id: string, status: string, home: string | null, runs: [number, number] | null = null) => ({
      id,
      season: 'Spring 2027',
      scheduled_at: '2026-11-11T02:00:00.000Z',
      time_zone: 'America/Boise',
      venue_name: null,
      status,
      home_team_id: HOME,
      away_team_id: AWAY,
      home_game_id: home,
      away_game_id: null,
      home_runs: runs?.[0] ?? null,
      away_runs: runs?.[1] ?? null,
    });
    const { db } = fakeDb({
      'league_staff.select': staff('league_manager'),
      // The league game carries the result that counts (here the away book's, accepted
      // over the home row's own 5-1), so the home row's score is never read.
      'league_games.select': { data: [row('g1', 'completed', HOME_GAME, [5, 3]), row('g2', 'scheduled', 'hg2')] },
      'teams.select': { data: [{ id: HOME, name: 'Hawks' }, { id: AWAY, name: 'Bears' }] },
      'games.select': { data: [{ id: HOME_GAME, home_score: 5, away_score: 1 }] },
      'game_reconciliations.select': {
        data: [
          { home_game_id: HOME_GAME, conflicts: [{ key: 'x' }], resolved_at: null },
          { home_game_id: 'hg2', conflicts: [], resolved_at: null },
        ],
      },
      'league_game_manual_results.select': { data: [{ league_game_id: 'g2' }] },
    });
    const result = await listLeagueGames(db, 'u1', { leagueId: LEAGUE });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.data.games[0]).toMatchObject({
      id: 'g1',
      home: { teamId: HOME, name: 'Hawks', gameId: HOME_GAME },
      away: { teamId: AWAY, name: 'Bears', gameId: null },
      homeRuns: 5,
      awayRuns: 3,
      hasManualResult: false,
      needsSettling: true,
    });
    expect(result.data.games[1]).toMatchObject({ homeRuns: null, awayRuns: null, hasManualResult: true, needsSettling: false });
  });
});

describe('createLeagueGame rollback', () => {
  it('should log a rollback step that fails and still try the rest', async () => {
    const { db, calls } = createFixture({
      'games.insert': [{ data: { id: HOME_GAME } }, { error: { message: 'boom' } }],
      'games.delete': { error: { message: 'delete blocked' } },
    });
    const logged = jest.spyOn(console, 'error');
    expect(await createLeagueGame(db, 'u1', input)).toMatchObject({ ok: false, code: 'failed' });
    const rollbackLogs = logged.mock.calls.filter((c) => String(c[0]).includes('rollback delete games failed'));
    expect(rollbackLogs).toHaveLength(1);
    expect(String(rollbackLogs[0][0])).toContain(`league_game=${LEAGUE_GAME}`);
    expect(String(rollbackLogs[0][0])).toContain(HOME_GAME);
    expect(calls.some((c) => c.table === 'league_games' && c.op === 'delete')).toBe(true);
  });
});
