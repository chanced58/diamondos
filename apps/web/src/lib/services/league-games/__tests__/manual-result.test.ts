import { enterManualResult, loadManualResult } from '../manual-result';
import { fakeDb, type FakeCall, type FakeResult } from '../../__tests__/fake-db';

const mockRefreshLeagueGame = jest.fn();
jest.mock('@/lib/league-games/refresh', () => ({
  refreshLeagueGame: (...args: unknown[]) => mockRefreshLeagueGame(...args),
}));

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const HOME = '22222222-2222-4222-8222-222222222222';
const AWAY = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const LEAGUE_GAME = '66666666-6666-4666-8666-666666666666';
const HOME_GAME = '77777777-7777-4777-8777-777777777777';
const HOME_PLAYER = '88888888-8888-4888-8888-888888888888';
const OTHER_PLAYER = '99999999-9999-4999-8999-999999999999';
const ACTOR = 'actor-1';
const ADMIN_USER = 'admin-1';

const leagueGame = {
  id: LEAGUE_GAME,
  league_id: LEAGUE,
  home_team_id: HOME,
  away_team_id: AWAY,
  home_game_id: HOME_GAME,
  away_game_id: null,
};

interface Setup {
  leagueRole?: string;
  teamRole?: string;
  /** The actor's team (default HOME). */
  teamId?: string;
  /** Seats of other users (an earlier entry's author), by user id. */
  seats?: Record<string, { team_id: string; role: string }[]>;
  lineRows?: Record<string, unknown>[];
  insertResults?: FakeResult[];
  events?: number;
  existing?: { entered_by: string; kind?: string } | null;
  players?: { id: string; team_id: string | null }[];
}

/** Actor seats, the game, any existing entry and the event count. */
function setup(opts: Setup = {}) {
  const results: Record<string, FakeResult | ((call: FakeCall) => FakeResult)> = {
    'league_games.select': { data: leagueGame },
    'league_staff.select': (call) => {
      if (call.filters.user_id === ADMIN_USER) return { data: { role: 'league_admin' } };
      return { data: opts.leagueRole ? { role: opts.leagueRole } : null };
    },
    'team_members.select': (call) => {
      if (call.filters.user_id === ACTOR) return { data: opts.teamRole ? [{ team_id: opts.teamId ?? HOME, role: opts.teamRole }] : [] };
      return { data: opts.seats?.[call.filters.user_id as string] ?? [] };
    },
    'league_game_manual_batting_lines.select': { data: opts.lineRows ?? [] },
    ...(opts.insertResults ? { 'league_game_manual_batting_lines.insert': opts.insertResults } : {}),
    'game_events.select': { count: opts.events ?? 0 },
    'league_game_manual_results.select': {
      data: opts.existing ? { league_game_id: LEAGUE_GAME, kind: 'final', home_runs: 1, away_runs: 0, ...opts.existing } : null,
    },
    'players.select': { data: opts.players ?? [] },
  };
  return fakeDb(results);
}

const finalInput = { kind: 'final' as const, leagueGameId: LEAGUE_GAME, homeRuns: 3, awayRuns: 2 };
const boxInput = {
  kind: 'box' as const,
  leagueGameId: LEAGUE_GAME,
  homeInningRuns: [1, 0, 2],
  awayInningRuns: [0, 4],
  homeHits: 5,
  awayHits: 6,
  homeErrors: 1,
  awayErrors: 0,
};
const line = { ab: 3, r: 1, h: 1, doubles: 0, triples: 0, hr: 0, rbi: 1, bb: 0, so: 1, hbp: 0, sf: 0, sb: 0 };

describe('enterManualResult', () => {
  beforeEach(() => mockRefreshLeagueGame.mockReset().mockResolvedValue(undefined));

  it('should refuse a hand entry once either team’s book has events', async () => {
    const { db, calls } = setup({ teamRole: 'head_coach', events: 4 });
    const result = await enterManualResult(db, ACTOR, finalInput);
    expect(result).toEqual({ ok: false, code: 'conflict', error: 'This game was scored in the app; settle it from the game page.' });
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
    expect(mockRefreshLeagueGame).not.toHaveBeenCalled();
  });

  it('should sum inning runs into the final score', async () => {
    const { db, calls } = setup({ teamRole: 'head_coach' });
    const result = await enterManualResult(db, ACTOR, boxInput);
    expect(result.ok).toBe(true);
    const upsert = calls.find((c) => c.table === 'league_game_manual_results' && c.op === 'upsert');
    expect(upsert?.payload).toMatchObject({ kind: 'box', home_runs: 3, away_runs: 4, entered_by: ACTOR });
  });

  it('should store a forfeit with no runs', async () => {
    const { db, calls } = setup({ leagueRole: 'league_admin' });
    const result = await enterManualResult(db, ACTOR, { kind: 'forfeit', leagueGameId: LEAGUE_GAME, winnerTeamId: AWAY });
    expect(result.ok).toBe(true);
    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.payload).toMatchObject({ home_runs: 0, away_runs: 0, forfeit_winner_team_id: AWAY });
  });

  it('should refuse a coach editing a league admin’s entry', async () => {
    const { db, calls } = setup({ teamRole: 'head_coach', existing: { entered_by: ADMIN_USER } });
    const result = await enterManualResult(db, ACTOR, finalInput);
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it('should let a league admin replace another admin’s entry', async () => {
    const { db } = setup({ leagueRole: 'league_admin', existing: { entered_by: ADMIN_USER } });
    expect((await enterManualResult(db, ACTOR, finalInput)).ok).toBe(true);
  });

  it('should let the home coach replace the away coach’s entry', async () => {
    const { db, calls } = setup({ teamRole: 'head_coach', existing: { entered_by: 'away-coach' } });
    const result = await enterManualResult(db, ACTOR, finalInput);
    expect(result.ok).toBe(true);
    expect(calls.find((c) => c.op === 'upsert')?.payload).toMatchObject({ entered_by: ACTOR, home_runs: 3 });
  });

  it('should refuse the away coach replacing the home coach’s entry', async () => {
    const { db, calls } = setup({
      teamRole: 'head_coach',
      teamId: AWAY,
      existing: { entered_by: 'home-coach' },
      seats: { 'home-coach': [{ team_id: HOME, role: 'head_coach' }] },
    });
    expect(await enterManualResult(db, ACTOR, finalInput)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it('should let the away coach edit their own team’s entry', async () => {
    const { db } = setup({
      teamRole: 'assistant_coach',
      teamId: AWAY,
      existing: { entered_by: 'away-coach' },
      seats: { 'away-coach': [{ team_id: AWAY, role: 'head_coach' }] },
    });
    expect((await enterManualResult(db, ACTOR, finalInput)).ok).toBe(true);
  });

  it('should restore the previous result and lines when saving the new lines fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const oldLine = { id: 'l1', league_game_id: LEAGUE_GAME, team_id: HOME, player_id: HOME_PLAYER, ab: 2 };
    const { db, calls } = setup({
      teamRole: 'head_coach',
      existing: { entered_by: ACTOR, kind: 'batting' },
      lineRows: [oldLine],
      players: [{ id: HOME_PLAYER, team_id: HOME }],
      insertResults: [{ error: { message: 'boom' } }, {}],
    });
    const result = await enterManualResult(db, ACTOR, {
      ...boxInput,
      kind: 'batting',
      lines: [{ teamId: HOME, playerId: HOME_PLAYER, ...line }],
    });
    expect(result).toMatchObject({ ok: false, code: 'failed' });
    expect(mockRefreshLeagueGame).not.toHaveBeenCalled();
    const upserts = calls.filter((c) => c.table === 'league_game_manual_results' && c.op === 'upsert');
    expect(upserts).toHaveLength(2);
    expect(upserts[1].payload).toMatchObject({ league_game_id: LEAGUE_GAME, kind: 'batting', home_runs: 1 });
    const inserts = calls.filter((c) => c.table === 'league_game_manual_batting_lines' && c.op === 'insert');
    expect(inserts[1].payload).toEqual([oldLine]);
    spy.mockRestore();
  });

  it('should delete a new result when there was none and the lines fail to save', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db, calls } = setup({
      teamRole: 'head_coach',
      players: [{ id: HOME_PLAYER, team_id: HOME }],
      insertResults: [{ error: { message: 'boom' } }],
    });
    const result = await enterManualResult(db, ACTOR, {
      ...boxInput,
      kind: 'batting',
      lines: [{ teamId: HOME, playerId: HOME_PLAYER, ...line }],
    });
    expect(result).toMatchObject({ ok: false, code: 'failed' });
    expect(calls.some((c) => c.table === 'league_game_manual_results' && c.op === 'delete')).toBe(true);
    spy.mockRestore();
  });

  it('should refuse a player who is not a coach or league admin', async () => {
    const { db } = setup({ teamRole: 'player' });
    expect(await enterManualResult(db, ACTOR, finalInput)).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('should hide the game from someone with no seat', async () => {
    const { db } = setup();
    expect(await enterManualResult(db, ACTOR, finalInput)).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('should refuse a batting line for a player on neither team', async () => {
    const { db, calls } = setup({ teamRole: 'head_coach', players: [{ id: OTHER_PLAYER, team_id: OTHER }] });
    const result = await enterManualResult(db, ACTOR, {
      ...boxInput,
      kind: 'batting',
      lines: [{ teamId: HOME, playerId: OTHER_PLAYER, ...line }],
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it('should replace the batting lines of a batting result', async () => {
    const { db, calls } = setup({ teamRole: 'head_coach', players: [{ id: HOME_PLAYER, team_id: HOME }] });
    const result = await enterManualResult(db, ACTOR, {
      ...boxInput,
      kind: 'batting',
      lines: [{ teamId: HOME, playerId: HOME_PLAYER, ...line }],
    });
    expect(result.ok).toBe(true);
    const lineCalls = calls.filter((c) => c.table === 'league_game_manual_batting_lines');
    expect(lineCalls.map((c) => c.op)).toEqual(['delete', 'insert']);
    expect(lineCalls[1].payload).toEqual([expect.objectContaining({ player_id: HOME_PLAYER, team_id: HOME, ab: 3 })]);
  });

  it('should refresh the league after saving', async () => {
    const { db } = setup({ teamRole: 'head_coach' });
    await enterManualResult(db, ACTOR, finalInput);
    expect(mockRefreshLeagueGame).toHaveBeenCalledWith(db, LEAGUE_GAME, ACTOR);
  });

  it('should keep a saved result when the refresh throws', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRefreshLeagueGame.mockRejectedValue(new Error('boom'));
    const { db } = setup({ teamRole: 'head_coach' });
    expect(await enterManualResult(db, ACTOR, finalInput)).toEqual({ ok: true, data: { leagueGameId: LEAGUE_GAME } });
    spy.mockRestore();
  });
});

describe('loadManualResult', () => {
  it('should return the saved entry, the rosters and edit rights', async () => {
    const { db } = setup({ teamRole: 'head_coach', existing: { entered_by: 'away-coach' }, players: [] });
    const result = await loadManualResult(db, ACTOR, { leagueGameId: LEAGUE_GAME });
    expect(result).toMatchObject({
      ok: true,
      data: { result: { kind: 'final', homeRuns: 1, awayRuns: 0 }, canEdit: true, rosters: [{ teamId: HOME }, { teamId: AWAY }] },
    });
  });

  it('should not offer editing once the game has events', async () => {
    const { db } = setup({ teamRole: 'head_coach', events: 2 });
    const result = await loadManualResult(db, ACTOR, { leagueGameId: LEAGUE_GAME });
    expect(result).toMatchObject({ ok: true, data: { canEdit: false } });
  });
});
