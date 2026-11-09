import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authorizeReconciliationSettler,
  resolveReconciliationConflict,
} from '../resolve-reconciliation-conflict';
import { fakeDb, type FakeCall, type FakeResult, type FakeResultFor } from '../../__tests__/fake-db';

const mockRefreshLeagueGame = jest.fn();
jest.mock('@/lib/league-games/refresh', () => ({
  refreshLeagueGame: (...args: unknown[]) => mockRefreshLeagueGame(...args),
}));

const HOME_GAME = 'game-home';
const HOME_TEAM = 'team-home';
const AWAY_TEAM = 'team-away';
const LEAGUE = 'league-1';
const LEAGUE_GAME = 'lg-1';
const RECON_ID = '22222222-2222-4222-8222-222222222222';

interface Setup {
  leagueGameId?: string | null;
  /** The actor's active seats on the two teams. */
  seats?: { team_id: string; role: string }[];
  leagueRole?: string | null;
  /** Active head and assistant coaches on the home team. */
  homeCoachCount?: number;
  platformAdmin?: boolean;
  extra?: Record<string, FakeResult | FakeResultFor>;
}

function settlerDb(setup: Setup = {}) {
  const leagueGameId = setup.leagueGameId === undefined ? LEAGUE_GAME : setup.leagueGameId;
  const fake = fakeDb({
    'games.select': { data: { team_id: HOME_TEAM, league_game_id: leagueGameId } },
    'league_games.select': { data: { league_id: LEAGUE, away_team_id: AWAY_TEAM } },
    'user_profiles.select': { data: { is_platform_admin: setup.platformAdmin ?? false } },
    'team_members.select': (call: FakeCall) =>
      call.filters.user_id
        ? { data: setup.seats ?? [] }
        : { data: null, count: setup.homeCoachCount ?? 0 },
    'league_staff.select': { data: setup.leagueRole ? { role: setup.leagueRole } : null },
    ...setup.extra,
  });
  const rpcCalls: [string, unknown][] = [];
  Object.assign(fake.db, {
    rpc: (name: string, args: unknown) => {
      rpcCalls.push([name, args]);
      return Promise.resolve({ error: null });
    },
  });
  return { ...fake, db: fake.db as SupabaseClient, rpcCalls };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authorizeReconciliationSettler', () => {
  it('should let the home team coach settle', async () => {
    const { db } = settlerDb({ seats: [{ team_id: HOME_TEAM, role: 'assistant_coach' }] });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toEqual({ ok: true, data: undefined });
  });

  it('should let the away coach settle when the home team has no coaches', async () => {
    const { db, calls } = settlerDb({ seats: [{ team_id: AWAY_TEAM, role: 'head_coach' }], homeCoachCount: 0 });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toEqual({ ok: true, data: undefined });
    const homeCoaches = calls.find((c) => c.table === 'team_members' && !c.filters.user_id);
    expect(homeCoaches?.filters).toEqual({ team_id: HOME_TEAM, is_active: true, role: ['head_coach', 'assistant_coach'] });
  });

  it('should refuse the away coach when the home team has a coach', async () => {
    const { db } = settlerDb({ seats: [{ team_id: AWAY_TEAM, role: 'head_coach' }], homeCoachCount: 1 });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toEqual({
      ok: false,
      code: 'forbidden',
      error: 'Only the home team coach can resolve conflicts.',
    });
  });

  it('should let a league admin of the league settle', async () => {
    const { db } = settlerDb({ leagueRole: 'league_admin', homeCoachCount: 1 });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toMatchObject({ ok: true });
  });

  it('should refuse a league manager', async () => {
    const { db } = settlerDb({ leagueRole: 'league_manager', homeCoachCount: 0 });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toMatchObject({ code: 'forbidden' });
  });

  it('should refuse a scorekeeper of the home team', async () => {
    const { db } = settlerDb({ seats: [{ team_id: HOME_TEAM, role: 'scorekeeper' }], homeCoachCount: 1 });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toMatchObject({ code: 'forbidden' });
  });

  it('should keep a paired game outside a league to the home team coach', async () => {
    const { db, calls } = settlerDb({ leagueGameId: null, seats: [], homeCoachCount: 0 });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toMatchObject({ code: 'forbidden' });
    expect(calls.some((c) => c.table === 'league_games' || c.table === 'league_staff')).toBe(false);
  });

  it('should let a platform admin settle', async () => {
    const { db } = settlerDb({ platformAdmin: true, homeCoachCount: 1 });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toMatchObject({ ok: true });
  });

  it('should report a missing game as not found', async () => {
    const { db } = settlerDb({ extra: { 'games.select': { data: null } } });
    expect(await authorizeReconciliationSettler(db, 'u1', HOME_GAME)).toMatchObject({ code: 'not_found' });
  });
});

describe('resolveReconciliationConflict for a league game', () => {
  const recon = {
    id: RECON_ID,
    home_game_id: HOME_GAME,
    conflicts: [{ kind: 'final_score', side: 'home', homeLog: 2, awayLog: 3 }],
  };
  const input = { reconciliationId: RECON_ID, conflictKey: 'final_score:home', useAwayValue: true };

  it('should refresh the league game after settling a difference', async () => {
    const { db, rpcCalls } = settlerDb({
      seats: [{ team_id: AWAY_TEAM, role: 'head_coach' }],
      homeCoachCount: 0,
      extra: { 'game_reconciliations.select': { data: recon } },
    });
    expect(await resolveReconciliationConflict(db, 'away-coach', input)).toEqual({ ok: true, data: { homeGameId: HOME_GAME } });
    expect(rpcCalls).toHaveLength(1);
    expect(mockRefreshLeagueGame).toHaveBeenCalledWith(db, LEAGUE_GAME, 'away-coach');
  });

  it('should not refresh when the settler is refused', async () => {
    const { db, rpcCalls } = settlerDb({
      seats: [{ team_id: AWAY_TEAM, role: 'head_coach' }],
      homeCoachCount: 1,
      extra: { 'game_reconciliations.select': { data: recon } },
    });
    expect(await resolveReconciliationConflict(db, 'away-coach', input)).toMatchObject({ code: 'forbidden' });
    expect(rpcCalls).toHaveLength(0);
    expect(mockRefreshLeagueGame).not.toHaveBeenCalled();
  });
});

describe('resolveReconciliationConflict settled state', () => {
  const COMPUTED_AT = '2026-11-08T04:00:00.000Z';
  const twoPlayers = [
    { kind: 'player_batting', playerId: 'a1', stat: 'hits', homeLog: 1, awayLog: 2 },
    { kind: 'player_pitching', playerId: 'a1', stat: 'strikeouts', homeLog: 3, awayLog: 4 },
    { kind: 'player_batting', playerId: 'b2', stat: 'hits', homeLog: 0, awayLog: 1 },
  ];

  /**
   * The home coach settling a reconciliation the fake keeps in memory: the
   * RPC records each override as the migration's function does (replacing the
   * key, true or false), and reads return the row as saved.
   */
  function settleDb(
    conflicts: unknown[],
    overrides: { key: string; useAwayValue: boolean }[] = [],
    settledWriteResult: FakeResult = {},
  ) {
    const row = { id: RECON_ID, home_game_id: HOME_GAME, conflicts, resolved_overrides: [...overrides], computed_at: COMPUTED_AT };
    const fake = settlerDb({
      leagueGameId: null,
      seats: [{ team_id: HOME_TEAM, role: 'head_coach' }],
      extra: {
        'game_reconciliations.select': () => ({ data: { ...row, resolved_overrides: [...row.resolved_overrides] } }),
        'game_reconciliations.update': settledWriteResult,
      },
    });
    Object.assign(fake.db, {
      rpc: (name: string, args: { p_key: string; p_use_away: boolean }) => {
        fake.rpcCalls.push([name, args]);
        row.resolved_overrides = [
          ...row.resolved_overrides.filter((o) => o.key !== args.p_key),
          { key: args.p_key, useAwayValue: args.p_use_away },
        ];
        return Promise.resolve({ error: null });
      },
    });
    const settledWrite = () => {
      const writes = fake.calls.filter((c) => c.table === 'game_reconciliations' && c.op === 'update');
      expect(writes).toHaveLength(1);
      return writes[0];
    };
    return { ...fake, row, settledWrite };
  }

  const choose = (db: SupabaseClient, conflictKey: string, useAwayValue: boolean) =>
    resolveReconciliationConflict(db, 'coach-1', { reconciliationId: RECON_ID, conflictKey, useAwayValue });

  it('should leave the reconciliation unsettled when one of two players is decided', async () => {
    const { db, settledWrite } = settleDb(twoPlayers);
    expect(await choose(db, 'player_batting:a1:hits', true)).toMatchObject({ ok: true });
    expect(settledWrite().payload).toEqual({ resolved_at: null, resolved_by: null });
  });

  it('should mark the reconciliation settled once every player is decided', async () => {
    const { db, settledWrite } = settleDb(twoPlayers, [{ key: 'player_batting:a1:hits', useAwayValue: true }]);
    expect(await choose(db, 'player_batting:b2:hits', true)).toMatchObject({ ok: true });
    const write = settledWrite();
    expect(write.payload).toEqual({ resolved_at: expect.any(String), resolved_by: 'coach-1' });
    // Held to the reconciliation as read, so a recompute in between is not marked settled.
    expect(write.filters).toEqual({ id: RECON_ID, computed_at: COMPUTED_AT });
  });

  it('should count keeping the home value as a decision', async () => {
    const { db, row, rpcCalls, settledWrite } = settleDb(twoPlayers, [{ key: 'player_batting:b2:hits', useAwayValue: true }]);
    expect(await choose(db, 'player_pitching:a1:strikeouts', false)).toMatchObject({ ok: true });
    // The home choice is recorded on every conflict of the player.
    expect(rpcCalls.map(([, args]) => [(args as { p_key: string }).p_key, (args as { p_use_away: boolean }).p_use_away])).toEqual([
      ['player_batting:a1:hits', false],
      ['player_pitching:a1:strikeouts', false],
    ]);
    expect(row.resolved_overrides).toContainEqual({ key: 'player_batting:a1:hits', useAwayValue: false });
    expect(settledWrite().payload).toMatchObject({ resolved_by: 'coach-1' });
  });

  it('should settle a line-score conflict kept at the home value', async () => {
    const { db, settledWrite } = settleDb([{ kind: 'final_score', side: 'home', homeLog: 2, awayLog: 3 }]);
    expect(await choose(db, 'final_score:home', false)).toMatchObject({ ok: true });
    expect(settledWrite().payload).toMatchObject({ resolved_at: expect.any(String) });
  });

  it('should answer failed when the settled mark cannot be written', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db } = settleDb([{ kind: 'final_score', side: 'home', homeLog: 2, awayLog: 3 }], [], { error: { message: 'boom' } });
    expect(await choose(db, 'final_score:home', true)).toMatchObject({ ok: false, code: 'failed' });
  });
});
