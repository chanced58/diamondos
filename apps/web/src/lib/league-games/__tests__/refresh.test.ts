import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshLeagueGame } from '../refresh';
import { finalizeGame } from '@/lib/games/finalize';
import { fakeDb, type FakeCall, type FakeResult } from '@/lib/services/__tests__/fake-db';
import { recomputeLeagueSnapshot } from '@/lib/league-snapshot/recompute';

jest.mock('@/lib/league-snapshot/recompute', () => ({ recomputeLeagueSnapshot: jest.fn() }));

const LEAGUE = 'league-1';
const SEASON = 'Spring 2027';
const LEAGUE_GAME = 'lg-1';
const HOME_TEAM = 'team-home';
const AWAY_TEAM = 'team-away';
const HOME_GAME = 'game-home';
const AWAY_GAME = 'game-away';
/** The away team's league roster record (the home book records away players through it). */
const AWAY_RECORD = 'record-away';
/** The home team's league roster record. */
const HOME_RECORD = 'record-home';

const SYNCED_AT = '2026-11-08T03:00:00.000Z';

interface GameRow {
  id: string;
  team_id: string;
  status: string;
  result_source: string | null;
  home_score: number;
  away_score: number;
  scorer_side: 'home' | 'away';
  paired_game_id: string;
  league_game_id: string;
  opponent_team_id: string;
  season_id: string;
}

type EventRow = Record<string, unknown>;

function event(gameId: string, seq: number, type: string, isTop: boolean, payload: Record<string, unknown> = {}): EventRow {
  return {
    id: `${gameId}-e${seq}`,
    game_id: gameId,
    sequence_number: seq,
    event_type: type,
    inning: 1,
    is_top_of_inning: isTop,
    payload,
    occurred_at: SYNCED_AT,
    synced_at: SYNCED_AT,
  };
}

/** Home book: the away batter hits one home run off the home pitcher. */
const HOME_BOOK: EventRow[] = [
  event(HOME_GAME, 1, 'game_start', true),
  event(HOME_GAME, 2, 'hit', true, { opponentBatterId: 'op-a1', pitcherId: 'h-pitcher', hitType: 'home_run' }),
  event(HOME_GAME, 3, 'game_end', true),
];

/** Away book: the same batter hits two home runs. */
const AWAY_BOOK: EventRow[] = [
  event(AWAY_GAME, 1, 'game_start', true),
  event(AWAY_GAME, 2, 'hit', true, { batterId: 'a1', opponentPitcherId: 'op-hpitcher', hitType: 'home_run' }),
  event(AWAY_GAME, 3, 'hit', true, { batterId: 'a1', opponentPitcherId: 'op-hpitcher', hitType: 'home_run' }),
  event(AWAY_GAME, 4, 'game_end', true),
];

function gameRow(side: 'home' | 'away', overrides: Partial<GameRow> = {}): GameRow {
  const home = side === 'home';
  return {
    id: home ? HOME_GAME : AWAY_GAME,
    team_id: home ? HOME_TEAM : AWAY_TEAM,
    status: 'scheduled',
    result_source: null,
    home_score: 0,
    away_score: 0,
    scorer_side: side,
    paired_game_id: home ? AWAY_GAME : HOME_GAME,
    league_game_id: LEAGUE_GAME,
    opponent_team_id: home ? AWAY_RECORD : HOME_RECORD,
    season_id: `season-${side}`,
    ...overrides,
  };
}

interface Scenario {
  leagueGameStatus?: string;
  /** The runs an earlier refresh put on the league game. */
  leagueGameRuns?: { home_runs: number | null; away_runs: number | null };
  home: GameRow;
  away: GameRow;
  events?: Record<string, EventRow[]>;
  reconciliation?: Record<string, unknown> | null;
  manual?: Record<string, unknown> | null;
  overrides?: Record<string, FakeResult>;
}

/**
 * A league game in a fake database that keeps the two team rows and the
 * reconciliation as state, so updates and upserts are seen by later reads.
 */
function leagueGameDb(scenario: Scenario) {
  const rows = new Map<string, GameRow>([
    [HOME_GAME, { ...scenario.home }],
    [AWAY_GAME, { ...scenario.away }],
  ]);
  const events = scenario.events ?? {};
  let reconciliation = scenario.reconciliation ?? null;

  const { db, calls } = fakeDb({
    'league_games.select': {
      data: {
        id: LEAGUE_GAME,
        league_id: LEAGUE,
        season: SEASON,
        status: scenario.leagueGameStatus ?? 'scheduled',
        home_team_id: HOME_TEAM,
        away_team_id: AWAY_TEAM,
        home_game_id: HOME_GAME,
        away_game_id: AWAY_GAME,
        ...(scenario.leagueGameRuns ?? { home_runs: null, away_runs: null }),
      },
    },
    'games.select': (call: FakeCall) => {
      const id = call.filters.id;
      if (Array.isArray(id)) return { data: id.map((gameId) => rows.get(gameId as string)).filter(Boolean) };
      return { data: rows.get(id as string) ?? null };
    },
    'games.update': (call: FakeCall) => {
      const row = rows.get(call.filters.id as string);
      if (row) rows.set(row.id, { ...row, ...(call.payload as Partial<GameRow>) });
      return {};
    },
    'game_events.select': (call: FakeCall) => {
      const list = events[call.filters.game_id as string] ?? [];
      return { data: list, count: list.length };
    },
    'game_reconciliations.select': () => ({ data: reconciliation }),
    'game_reconciliations.upsert': (call: FakeCall) => {
      const payload = call.payload as Record<string, unknown>;
      reconciliation = {
        id: 'recon-1',
        resolved_overrides: [],
        ...(reconciliation ?? {}),
        ...payload,
      };
      return { data: { id: 'recon-1' } };
    },
    'league_game_manual_results.select': { data: scenario.manual ?? null },
    'teams.select': { data: [{ id: HOME_TEAM, name: 'Hawks' }, { id: AWAY_TEAM, name: 'Bears' }] },
    'team_members.select': {
      data: [
        { user_id: 'home-coach', team_id: HOME_TEAM },
        { user_id: 'home-scorer', team_id: HOME_TEAM },
        { user_id: 'away-coach', team_id: AWAY_TEAM },
      ],
    },
    'players.select': {
      data: [
        { id: 'h1', team_id: HOME_TEAM },
        { id: 'h-pitcher', team_id: HOME_TEAM },
        { id: 'a1', team_id: AWAY_TEAM },
      ],
    },
    'player_team_memberships.select': { data: [] },
    'game_lineups.select': { data: [] },
    'opponent_players.select': {
      data: [
        { id: 'op-a1', opponent_team_id: AWAY_RECORD, linked_player_id: 'a1', placeholder_game_id: null, is_fill_in: false },
        { id: 'op-hpitcher', opponent_team_id: HOME_RECORD, linked_player_id: 'h-pitcher', placeholder_game_id: null, is_fill_in: false },
      ],
    },
    ...scenario.overrides,
  });

  const invoke = jest.fn().mockResolvedValue({ data: null, error: null });
  Object.assign(db, { functions: { invoke } });
  return { db: db as SupabaseClient, calls, invoke, rows };
}

const writes = (calls: FakeCall[], table: string, op: string) => calls.filter((c) => c.table === table && c.op === op);

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('refreshLeagueGame', () => {
  it('should reconcile when the second book completes after the paired result was written', async () => {
    // The home team finished first, so an earlier refresh wrote its result onto
    // the away row; the away team's own book then synced and is finalized.
    const { db, calls, invoke, rows } = leagueGameDb({
      leagueGameStatus: 'completed',
      home: gameRow('home', { status: 'completed', home_score: 0, away_score: 1 }),
      away: gameRow('away', { status: 'completed', result_source: 'paired', home_score: 0, away_score: 1 }),
      events: { [HOME_GAME]: HOME_BOOK, [AWAY_GAME]: AWAY_BOOK },
    });

    const result = await finalizeGame(db, {
      gameId: AWAY_GAME,
      userId: 'away-coach',
      clientHomeScore: 0,
      clientAwayScore: 2,
      inning: 1,
      isTopOfInning: true,
      deviceId: 'device-1',
    });

    expect(result).toEqual({ ok: true });
    expect(rows.get(AWAY_GAME)).toMatchObject({ status: 'completed', result_source: null, away_score: 2 });

    const upserts = writes(calls, 'game_reconciliations', 'upsert');
    expect(upserts).toHaveLength(1);
    const upserted = upserts[0].payload as { home_game_id: string; away_game_id: string; conflicts: unknown[] };
    expect(upserted).toMatchObject({ home_game_id: HOME_GAME, away_game_id: AWAY_GAME, computed_by: 'away-coach' });
    expect(upserted.conflicts).toEqual(
      expect.arrayContaining([
        { kind: 'final_score', side: 'away', homeLog: 1, awayLog: 2 },
        { kind: 'player_batting', playerId: 'a1', stat: 'hits', homeLog: 1, awayLog: 2 },
        { kind: 'player_pitching', playerId: 'h-pitcher', stat: 'hitsAllowed', homeLog: 1, awayLog: 2 },
      ]),
    );

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith('push-notifications', {
      body: {
        userIds: ['home-coach', 'home-scorer'],
        title: "Scorebooks don't match",
        body: 'Both teams scored Hawks vs Bears. Review the differences.',
        data: { kind: 'game', gameId: HOME_GAME },
      },
    });
    expect(invoke).toHaveBeenCalledWith('push-notifications', {
      body: {
        userIds: ['away-coach'],
        title: "Scorebooks don't match",
        body: 'Both teams scored Hawks vs Bears. Review the differences.',
        data: { kind: 'game', gameId: AWAY_GAME },
      },
    });
    const roleFilter = writes(calls, 'team_members', 'select')[0].filters;
    expect(roleFilter).toMatchObject({
      team_id: [HOME_TEAM, AWAY_TEAM],
      role: ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper'],
      is_active: true,
    });

    // Neither row has an eventless book, so no league result is written onto a team row.
    expect(writes(calls, 'games', 'update').filter((c) => (c.payload as GameRow).result_source)).toHaveLength(0);
    // The league_members loop is skipped; the league game's own league is rebuilt.
    expect(calls.some((c) => c.table === 'league_members')).toBe(false);
    expect(recomputeLeagueSnapshot).toHaveBeenCalledWith(db, LEAGUE, SEASON);
  });

  it('should not count a book still being scored on a row that carries the paired result', async () => {
    // The home book finished first and its result was written onto the away row;
    // the away phone is still pushing events and hasn't finalized.
    const { db, calls, invoke, rows } = leagueGameDb({
      leagueGameStatus: 'completed',
      home: gameRow('home', { status: 'completed', home_score: 0, away_score: 1 }),
      away: gameRow('away', { status: 'completed', result_source: 'paired', home_score: 0, away_score: 1 }),
      events: { [HOME_GAME]: HOME_BOOK, [AWAY_GAME]: AWAY_BOOK.slice(0, 2) },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'home-coach');

    expect(writes(calls, 'game_reconciliations', 'upsert')).toHaveLength(0);
    expect(invoke).not.toHaveBeenCalled();
    expect(writes(calls, 'games', 'update')).toHaveLength(0);
    expect(rows.get(AWAY_GAME)).toMatchObject({ status: 'completed', result_source: 'paired', away_score: 1 });
    expect(recomputeLeagueSnapshot).toHaveBeenCalledWith(db, LEAGUE, SEASON);
  });

  it('should write the result onto a scheduled row with no events', async () => {
    const { db, calls, invoke } = leagueGameDb({
      home: gameRow('home', { status: 'completed', home_score: 3, away_score: 1 }),
      away: gameRow('away'),
      events: { [HOME_GAME]: HOME_BOOK },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'home-coach');

    expect(writes(calls, 'league_games', 'update').map((c) => c.payload)).toEqual([
      { status: 'completed', home_runs: 3, away_runs: 1 },
    ]);
    const gameUpdates = writes(calls, 'games', 'update');
    expect(gameUpdates).toHaveLength(1);
    expect(gameUpdates[0].filters).toEqual({ id: AWAY_GAME });
    expect(gameUpdates[0].payload).toMatchObject({
      status: 'completed',
      home_score: 3,
      away_score: 1,
      result_source: 'paired',
    });
    expect(writes(calls, 'game_reconciliations', 'upsert')).toHaveLength(0);
    expect(invoke).not.toHaveBeenCalled();
    expect(recomputeLeagueSnapshot).toHaveBeenCalledWith(db, LEAGUE, SEASON);
  });

  it('should never write onto an in-progress row', async () => {
    const { db, calls } = leagueGameDb({
      home: gameRow('home', { status: 'completed', home_score: 3, away_score: 1 }),
      away: gameRow('away', { status: 'in_progress', result_source: 'paired' }),
      events: { [HOME_GAME]: HOME_BOOK },
    });

    await refreshLeagueGame(db, LEAGUE_GAME);

    expect(writes(calls, 'games', 'update')).toHaveLength(0);
    expect(writes(calls, 'league_games', 'update').map((c) => c.payload)).toEqual([
      { status: 'completed', home_runs: 3, away_runs: 1 },
    ]);
  });

  it('should not send a second push when the reconciliation already exists and nothing changed', async () => {
    const { db, calls, invoke } = leagueGameDb({
      leagueGameStatus: 'completed',
      home: gameRow('home', { status: 'completed', away_score: 1 }),
      away: gameRow('away', { status: 'completed', away_score: 2 }),
      events: { [HOME_GAME]: HOME_BOOK, [AWAY_GAME]: AWAY_BOOK },
      reconciliation: {
        id: 'recon-1',
        computed_at: '2026-11-08T04:00:00.000Z',
        conflicts: [{ kind: 'final_score', side: 'away', homeLog: 1, awayLog: 2 }],
        resolved_overrides: [],
      },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'home-coach');

    expect(writes(calls, 'game_reconciliations', 'upsert')).toHaveLength(0);
    expect(invoke).not.toHaveBeenCalled();
    expect(writes(calls, 'games', 'update')).toHaveLength(0);
    expect(recomputeLeagueSnapshot).toHaveBeenCalledWith(db, LEAGUE, SEASON);
  });

  it('should recompute a stale reconciliation without notifying again', async () => {
    const { db, calls, invoke } = leagueGameDb({
      leagueGameStatus: 'completed',
      home: gameRow('home', { status: 'completed', away_score: 1 }),
      away: gameRow('away', { status: 'completed', away_score: 2 }),
      events: { [HOME_GAME]: HOME_BOOK, [AWAY_GAME]: AWAY_BOOK },
      reconciliation: {
        id: 'recon-1',
        computed_at: '2026-11-08T02:00:00.000Z',
        conflicts: [],
        resolved_overrides: [],
      },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'home-coach');

    expect(writes(calls, 'game_reconciliations', 'upsert')).toHaveLength(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('should recompute a current reconciliation when a placeholder match forces it', async () => {
    const { db, calls, invoke } = leagueGameDb({
      leagueGameStatus: 'completed',
      home: gameRow('home', { status: 'completed', away_score: 1 }),
      away: gameRow('away', { status: 'completed', away_score: 2 }),
      events: { [HOME_GAME]: HOME_BOOK, [AWAY_GAME]: AWAY_BOOK },
      reconciliation: {
        id: 'recon-1',
        computed_at: '2026-11-08T04:00:00.000Z',
        conflicts: [{ kind: 'final_score', side: 'away', homeLog: 1, awayLog: 2 }],
        resolved_overrides: [],
        resolved_at: null,
      },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'home-coach');
    expect(writes(calls, 'game_reconciliations', 'upsert')).toHaveLength(0);

    await refreshLeagueGame(db, LEAGUE_GAME, 'home-coach', { forceReconcile: true });
    const upserts = writes(calls, 'game_reconciliations', 'upsert');
    expect(upserts).toHaveLength(1);
    expect((upserts[0].payload as { conflicts: { kind: string }[] }).conflicts.map((c) => c.kind)).toEqual(
      expect.arrayContaining(['final_score', 'player_batting', 'player_pitching']),
    );
    // Not a new reconciliation, so no second push.
    expect(invoke).not.toHaveBeenCalled();
  });

  it("should reopen a settled reconciliation when a newly matched player's lines differ", async () => {
    const { db, calls } = leagueGameDb({
      leagueGameStatus: 'completed',
      home: gameRow('home', { status: 'completed', away_score: 1 }),
      away: gameRow('away', { status: 'completed', away_score: 2 }),
      events: { [HOME_GAME]: HOME_BOOK, [AWAY_GAME]: AWAY_BOOK },
      reconciliation: {
        id: 'recon-1',
        computed_at: '2026-11-08T04:00:00.000Z',
        conflicts: [{ kind: 'final_score', side: 'away', homeLog: 1, awayLog: 2 }],
        resolved_overrides: [{ key: 'final_score:away', useAwayValue: true }],
        resolved_at: '2026-11-08T05:00:00.000Z',
      },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'admin-1', { forceReconcile: true });

    const [upsert] = writes(calls, 'game_reconciliations', 'upsert');
    expect(upsert.payload).toMatchObject({ resolved_at: null, resolved_by: null });
  });

  it('should keep a settled reconciliation settled when a recompute finds nothing new', async () => {
    const books = {
      leagueGameStatus: 'completed',
      home: gameRow('home', { status: 'completed', away_score: 1 }),
      away: gameRow('away', { status: 'completed', away_score: 2 }),
      events: { [HOME_GAME]: HOME_BOOK, [AWAY_GAME]: AWAY_BOOK },
    };
    // The differences these two books have, as a first reconciliation records them.
    const first = leagueGameDb(books);
    await refreshLeagueGame(first.db, LEAGUE_GAME, 'home-coach');
    const [created] = writes(first.calls, 'game_reconciliations', 'upsert');
    const conflicts = (created.payload as { conflicts: unknown[] }).conflicts;
    expect(conflicts.length).toBeGreaterThan(0);

    const { db, calls } = leagueGameDb({
      ...books,
      reconciliation: {
        id: 'recon-1',
        computed_at: '2026-11-08T04:00:00.000Z',
        conflicts,
        resolved_overrides: [],
        resolved_at: '2026-11-08T05:00:00.000Z',
      },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'admin-1', { forceReconcile: true });

    const [upsert] = writes(calls, 'game_reconciliations', 'upsert');
    expect(upsert.payload).not.toHaveProperty('resolved_at');
  });

  it('should write a hand-entered result onto both team rows', async () => {
    const { db, calls } = leagueGameDb({
      home: gameRow('home'),
      away: gameRow('away'),
      manual: { kind: 'box', home_runs: 4, away_runs: 2 },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'admin-1');

    const gameUpdates = writes(calls, 'games', 'update');
    expect(gameUpdates.map((c) => c.filters.id)).toEqual([HOME_GAME, AWAY_GAME]);
    for (const update of gameUpdates) {
      expect(update.payload).toMatchObject({ status: 'completed', home_score: 4, away_score: 2, result_source: 'manual' });
    }
    expect(writes(calls, 'league_games', 'update').map((c) => c.payload)).toEqual([
      { status: 'completed', home_runs: 4, away_runs: 2 },
    ]);
  });

  it('should add no runs to either row for a forfeit', async () => {
    const { db, calls } = leagueGameDb({
      home: gameRow('home'),
      away: gameRow('away', { status: 'in_progress' }),
      manual: { kind: 'forfeit', home_runs: null, away_runs: null },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'admin-1');

    const gameUpdates = writes(calls, 'games', 'update');
    expect(gameUpdates.map((c) => c.filters.id)).toEqual([HOME_GAME]);
    expect(gameUpdates[0].payload).toMatchObject({ home_score: 0, away_score: 0, result_source: 'manual' });
    expect(writes(calls, 'league_games', 'update').map((c) => c.payload)).toEqual([
      { status: 'completed', home_runs: 0, away_runs: 0 },
    ]);
  });

  it("should put the away book's score on the league game when the home coach accepted it", async () => {
    const { db, calls } = leagueGameDb({
      leagueGameStatus: 'completed',
      leagueGameRuns: { home_runs: 0, away_runs: 1 },
      home: gameRow('home', { status: 'completed', away_score: 1 }),
      away: gameRow('away', { status: 'completed', away_score: 2 }),
      events: { [HOME_GAME]: HOME_BOOK, [AWAY_GAME]: AWAY_BOOK },
      reconciliation: {
        id: 'recon-1',
        computed_at: '2026-11-08T04:00:00.000Z',
        conflicts: [{ kind: 'final_score', side: 'away', homeLog: 1, awayLog: 2 }],
        resolved_overrides: [{ key: 'final_score:away', useAwayValue: true }],
      },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'home-coach');

    expect(writes(calls, 'league_games', 'update').map((c) => c.payload)).toEqual([
      { status: 'completed', home_runs: 0, away_runs: 2 },
    ]);
  });

  it("should put the away book's score on the league game while the home book is still being scored", async () => {
    const { db, calls } = leagueGameDb({
      home: gameRow('home', { status: 'in_progress', away_score: 1 }),
      away: gameRow('away', { status: 'completed', away_score: 2 }),
      events: { [HOME_GAME]: HOME_BOOK.slice(0, 2), [AWAY_GAME]: AWAY_BOOK },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'away-coach');

    expect(writes(calls, 'league_games', 'update').map((c) => c.payload)).toEqual([
      { status: 'completed', home_runs: 0, away_runs: 2 },
    ]);
    // The home row is being scored, so the result is not written onto it.
    expect(writes(calls, 'games', 'update')).toHaveLength(0);
  });

  it('should not rewrite the league game when its result is unchanged', async () => {
    const { db, calls } = leagueGameDb({
      leagueGameStatus: 'completed',
      leagueGameRuns: { home_runs: 3, away_runs: 1 },
      home: gameRow('home', { status: 'completed', home_score: 3, away_score: 1 }),
      away: gameRow('away', { status: 'completed', result_source: 'paired', home_score: 3, away_score: 1 }),
      events: { [HOME_GAME]: HOME_BOOK },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'home-coach');

    expect(writes(calls, 'league_games', 'update')).toHaveLength(0);
  });

  it('should clear the runs of a cancelled league game', async () => {
    const { db, calls } = leagueGameDb({
      leagueGameStatus: 'cancelled',
      leagueGameRuns: { home_runs: 4, away_runs: 2 },
      home: gameRow('home', { status: 'cancelled' }),
      away: gameRow('away', { status: 'cancelled' }),
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'admin-1');

    expect(writes(calls, 'league_games', 'update').map((c) => c.payload)).toEqual([
      { status: 'cancelled', home_runs: null, away_runs: null },
    ]);
    expect(writes(calls, 'games', 'update')).toHaveLength(0);
    expect(recomputeLeagueSnapshot).toHaveBeenCalledWith(db, LEAGUE, SEASON);
  });

  it('should only rebuild the snapshot for a cancelled league game', async () => {
    const { db, calls } = leagueGameDb({
      leagueGameStatus: 'cancelled',
      home: gameRow('home', { status: 'cancelled' }),
      away: gameRow('away', { status: 'cancelled' }),
      manual: { kind: 'final', home_runs: 4, away_runs: 2 },
    });

    await refreshLeagueGame(db, LEAGUE_GAME, 'admin-1');

    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    expect(recomputeLeagueSnapshot).toHaveBeenCalledWith(db, LEAGUE, SEASON);
  });

  it('should log a failure with the league game id and not throw', async () => {
    const { db } = leagueGameDb({
      home: gameRow('home'),
      away: gameRow('away'),
      overrides: { 'league_games.select': { error: { message: 'boom' } } },
    });

    await expect(refreshLeagueGame(db, LEAGUE_GAME)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(`[refreshLeagueGame] league_game=${LEAGUE_GAME}:`, expect.any(Error));
    expect(recomputeLeagueSnapshot).not.toHaveBeenCalled();
  });

  it('should still rebuild the snapshot when the result step fails', async () => {
    const { db } = leagueGameDb({
      home: gameRow('home'),
      away: gameRow('away'),
      overrides: { 'game_events.select': { error: { message: 'timeout' } } },
    });

    await refreshLeagueGame(db, LEAGUE_GAME);

    expect(errorSpy).toHaveBeenCalledWith(
      `[refreshLeagueGame] result refresh failed league_game=${LEAGUE_GAME}:`,
      expect.objectContaining({ message: expect.stringContaining(LEAGUE_GAME) }),
    );
    expect(recomputeLeagueSnapshot).toHaveBeenCalledWith(db, LEAGUE, SEASON);
  });
});
