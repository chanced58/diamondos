import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authorizeReconciliationSettler,
  resolveReconciliationConflict,
} from '../resolve-reconciliation-conflict';
import { fakeDb, type FakeCall, type FakeResult } from '../../__tests__/fake-db';

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
  extra?: Record<string, FakeResult>;
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
