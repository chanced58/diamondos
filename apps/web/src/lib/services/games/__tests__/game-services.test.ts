import type { SupabaseClient } from '@supabase/supabase-js';
import { loadGameDetail } from '../load-game-detail';
import { cancelGame } from '../cancel-game';
import { resetGame } from '../reset-game';
import { recalculateScores } from '../recalculate-scores';
import { resolveReconciliationConflict } from '../resolve-reconciliation-conflict';

const mockGetAuthorizedCoach = jest.fn();
const mockDeriveScores = jest.fn();
const mockPostEventAlert = jest.fn();
const mockGetGameWeaknesses = jest.fn();
const mockLoadReconciliation = jest.fn();

jest.mock('@/lib/games/finalize', () => ({
  getAuthorizedCoach: (...args: unknown[]) => mockGetAuthorizedCoach(...args),
  deriveScoresFromEvents: (...args: unknown[]) => mockDeriveScores(...args),
}));
jest.mock('@/app/(app)/messages/notify', () => ({
  postEventAlert: (...args: unknown[]) => mockPostEventAlert(...args),
}));
jest.mock('@baseball/database', () => ({
  getGameWeaknesses: (...args: unknown[]) => mockGetGameWeaknesses(...args),
}));
jest.mock('@/lib/dual-scorekeeper/load', () => ({
  loadReconciliationForGame: (...args: unknown[]) => mockLoadReconciliation(...args),
}));

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const RECON_ID = '22222222-2222-4222-8222-222222222222';

type Op = 'select' | 'insert' | 'update';
interface Call { table: string; op: Op; filters: Record<string, unknown>; payload?: unknown }
type Result = { data?: unknown; error?: unknown; count?: number };

/** A Supabase client fake: results are keyed `table.op`, every call is recorded. */
function fakeDb(results: Record<string, Result>, rpcResult: Result = { error: null }) {
  const calls: Call[] = [];
  const rpcCalls: [string, unknown][] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: {} };
      calls.push(call);
      const resolve = () => Promise.resolve({ data: null, error: null, ...results[`${table}.${call.op}`] });
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
        eq: (col: string, val: unknown) => { call.filters[col] = val; return builder; },
        order: () => builder,
        limit: () => builder,
        maybeSingle: resolve,
        single: resolve,
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          resolve().then(onFulfilled, onRejected),
      };
      return builder;
    },
    rpc(name: string, args: unknown) {
      rpcCalls.push([name, args]);
      return Promise.resolve(rpcResult);
    },
  };
  return { db: db as unknown as SupabaseClient, calls, rpcCalls };
}

const gameRow = {
  id: GAME_ID,
  team_id: 'team-1',
  status: 'completed',
  opponent_name: 'Eagles',
  opponent_team_id: null,
  scheduled_at: '2026-10-20T23:00:00.000Z',
  time_zone: 'America/Chicago',
  location_type: 'home',
  neutral_home_team: null,
  venue_name: 'Field 2',
  notes: null,
  home_score: 2,
  away_score: 5,
  current_inning: 7,
  latitude: null,
  longitude: null,
  tournament_id: null,
};

const authorizedGame = { ...gameRow };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthorizedCoach.mockResolvedValue({ game: authorizedGame });
  mockLoadReconciliation.mockResolvedValue(null);
  mockGetGameWeaknesses.mockResolvedValue([]);
});

describe('loadGameDetail', () => {
  it('should hide a game from someone who is not on its team', async () => {
    const { db } = fakeDb({ 'games.select': { data: gameRow } });
    expect(await loadGameDetail(db, 'stranger', { gameId: GAME_ID }))
      .toEqual({ ok: false, code: 'not_found', error: 'Game not found.' });
  });

  it('should require an active membership', async () => {
    const { db, calls } = fakeDb({
      'games.select': { data: gameRow },
      'team_members.select': { data: { role: 'player' } },
    });
    await loadGameDetail(db, 'player-1', { gameId: GAME_ID });
    const membership = calls.find((c) => c.table === 'team_members');
    expect(membership?.filters).toMatchObject({ team_id: 'team-1', user_id: 'player-1', is_active: true });
  });

  it('should give a player the game without coach takeaways', async () => {
    const { db } = fakeDb({
      'games.select': { data: gameRow },
      'team_members.select': { data: { role: 'player' } },
      'game_lineups.select': { count: 9 },
    });
    const result = await loadGameDetail(db, 'player-1', { gameId: GAME_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.viewer).toEqual({ isCoach: false });
    expect(result.data.hasLineup).toBe(true);
    expect(result.data.hasOpponentLineup).toBe(false);
    expect(result.data.takeaways).toBeNull();
    expect(result.data.game).toMatchObject({ id: GAME_ID, status: 'completed', venueName: 'Field 2', homeScore: 2 });
    expect(mockGetGameWeaknesses).not.toHaveBeenCalled();
  });

  it('should give a coach the top three takeaways and flag a loss', async () => {
    mockGetGameWeaknesses.mockResolvedValue(
      ['a', 'b', 'c', 'd'].map((code) => ({
        code, label: `L-${code}`, description: 'd', severity: 'high', score: 1,
        evidence: { metric: `m-${code}`, value: 1 }, suggestedDeficitSlugs: [], suggestedDeficitIds: [],
      })),
    );
    const { db } = fakeDb({
      'games.select': { data: gameRow },
      'team_members.select': { data: { role: 'assistant_coach' } },
    });
    const result = await loadGameDetail(db, 'coach-1', { gameId: GAME_ID });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.takeaways?.lostGame).toBe(true); // home, 2–5
    expect(result.data.takeaways?.items.map((t) => t.code)).toEqual(['a', 'b', 'c']);
    expect(result.data.takeaways?.items[0]).toEqual({
      code: 'a', label: 'L-a', description: 'd', severity: 'high', metric: 'm-a',
    });
  });

  it('should report takeaways as unavailable when detection fails', async () => {
    mockGetGameWeaknesses.mockRejectedValue(new Error('boom'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb({
      'games.select': { data: gameRow },
      'team_members.select': { data: { role: 'head_coach' } },
    });
    const result = await loadGameDetail(db, 'coach-1', { gameId: GAME_ID });
    log.mockRestore();
    if (!result.ok) throw new Error(result.error);
    expect(result.data.takeaways).toEqual({ lostGame: true, unavailable: true, items: [] });
  });

  it('should label reconciliation conflicts and let only the home coach override', async () => {
    mockLoadReconciliation.mockResolvedValue({
      reconciliationId: RECON_ID,
      homeGameId: GAME_ID,
      awayGameId: 'away-game',
      conflicts: [
        { kind: 'final_score', side: 'home', homeLog: 2, awayLog: 3 },
        { kind: 'team_hits', side: 'away', homeLog: 6, awayLog: 7 },
      ],
      overrides: [{ key: 'team_hits:away', useAwayValue: true }],
      homeTeamLabel: 'Huskies',
      awayTeamLabel: 'Eagles',
      viewerOnHomeSide: true,
    });
    const coach = fakeDb({ 'games.select': { data: gameRow }, 'team_members.select': { data: { role: 'head_coach' } } });
    const coachResult = await loadGameDetail(coach.db, 'coach-1', { gameId: GAME_ID });
    if (!coachResult.ok) throw new Error(coachResult.error);
    expect(coachResult.data.reconciliation).toEqual({
      reconciliationId: RECON_ID,
      homeTeamLabel: 'Huskies',
      awayTeamLabel: 'Eagles',
      canOverride: true,
      conflicts: [
        { key: 'final_score:home', label: 'Final score — home runs', homeLog: 2, awayLog: 3, overridden: false },
        { key: 'team_hits:away', label: 'Team hits — away', homeLog: 6, awayLog: 7, overridden: true },
      ],
    });

    const parent = fakeDb({ 'games.select': { data: gameRow }, 'team_members.select': { data: { role: 'parent' } } });
    const parentResult = await loadGameDetail(parent.db, 'parent-1', { gameId: GAME_ID });
    if (!parentResult.ok) throw new Error(parentResult.error);
    expect(parentResult.data.reconciliation?.canOverride).toBe(false);
  });
});

describe('cancelGame', () => {
  it('should refuse a non-coach without touching the game', async () => {
    mockGetAuthorizedCoach.mockResolvedValue({ error: 'Only coaches can perform this action.', code: 'forbidden' });
    const { db, calls } = fakeDb({});
    expect(await cancelGame(db, 'player-1', { gameId: GAME_ID }))
      .toEqual({ ok: false, code: 'forbidden', error: 'Only coaches can perform this action.' });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('should cancel the game and notify the team when asked', async () => {
    const { db, calls } = fakeDb({});
    expect(await cancelGame(db, 'coach-1', { gameId: GAME_ID, notifyTeam: true }))
      .toEqual({ ok: true, data: { gameId: GAME_ID } });
    const update = calls.find((c) => c.table === 'games' && c.op === 'update');
    expect(update?.payload).toMatchObject({ status: 'cancelled' });
    expect(update?.filters).toEqual({ id: GAME_ID });
    expect(mockPostEventAlert).toHaveBeenCalledWith(db, 'team-1', 'coach-1', expect.stringContaining('Eagles'));
  });

  it('should not announce a cancelled game against a TBD opponent', async () => {
    mockGetAuthorizedCoach.mockResolvedValue({ game: { ...authorizedGame, opponent_name: '  ' } });
    const { db } = fakeDb({});
    await cancelGame(db, 'coach-1', { gameId: GAME_ID, notifyTeam: true });
    expect(mockPostEventAlert).not.toHaveBeenCalled();
  });
});

describe('resetGame', () => {
  it('should refuse to reset a game that has not started', async () => {
    mockGetAuthorizedCoach.mockResolvedValue({ game: { ...authorizedGame, status: 'scheduled' } });
    const { db, calls } = fakeDb({});
    expect(await resetGame(db, 'coach-1', { gameId: GAME_ID }, 'mobile'))
      .toEqual({ ok: false, code: 'conflict', error: 'Game is already in scheduled state.' });
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });

  it('should append a game_reset event after the last one and reschedule the game', async () => {
    const { db, calls } = fakeDb({ 'game_events.select': { data: { sequence_number: 41 } } });
    expect(await resetGame(db, 'coach-1', { gameId: GAME_ID }, 'device-9'))
      .toEqual({ ok: true, data: { gameId: GAME_ID } });
    const insert = calls.find((c) => c.table === 'game_events' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({
      game_id: GAME_ID, sequence_number: 42, event_type: 'game_reset', device_id: 'device-9', created_by: 'coach-1',
      payload: { resetBy: 'coach-1', previousStatus: 'completed' },
    });
    const update = calls.find((c) => c.table === 'games' && c.op === 'update');
    expect(update?.payload).toMatchObject({ status: 'scheduled', home_score: 0, away_score: 0 });
  });
});

describe('recalculateScores', () => {
  it('should store the scores replayed from the event log', async () => {
    mockDeriveScores.mockResolvedValue({ homeScore: 7, awayScore: 4 });
    const { db, calls } = fakeDb({});
    expect(await recalculateScores(db, 'coach-1', { gameId: GAME_ID }))
      .toEqual({ ok: true, data: { gameId: GAME_ID, homeScore: 7, awayScore: 4 } });
    const update = calls.find((c) => c.table === 'games' && c.op === 'update');
    expect(update?.payload).toMatchObject({ home_score: 7, away_score: 4 });
  });
});

describe('resolveReconciliationConflict', () => {
  const recon = {
    id: RECON_ID,
    home_game_id: GAME_ID,
    conflicts: [{ kind: 'final_score', side: 'home', homeLog: 2, awayLog: 3 }],
  };
  const input = { reconciliationId: RECON_ID, conflictKey: 'final_score:home', useAwayValue: true };

  it('should report a missing reconciliation as not found', async () => {
    const { db } = fakeDb({});
    expect(await resolveReconciliationConflict(db, 'coach-1', input))
      .toEqual({ ok: false, code: 'not_found', error: 'Reconciliation not found.' });
  });

  it('should only let the home coach override', async () => {
    mockGetAuthorizedCoach.mockResolvedValue({ error: 'Only coaches can perform this action.', code: 'forbidden' });
    const { db, rpcCalls } = fakeDb({ 'game_reconciliations.select': { data: recon } });
    expect(await resolveReconciliationConflict(db, 'away-coach', input))
      .toEqual({ ok: false, code: 'forbidden', error: 'Only the home team coach can resolve conflicts.' });
    expect(mockGetAuthorizedCoach).toHaveBeenCalledWith(db, 'away-coach', GAME_ID);
    expect(rpcCalls).toHaveLength(0);
  });

  it('should reject a key that is no longer a current conflict', async () => {
    const { db, rpcCalls } = fakeDb({ 'game_reconciliations.select': { data: recon } });
    const result = await resolveReconciliationConflict(db, 'coach-1', { ...input, conflictKey: 'team_hits:home' });
    expect(result).toEqual({ ok: false, code: 'conflict', error: 'That conflict no longer exists — reload the game.' });
    expect(rpcCalls).toHaveLength(0);
  });

  it('should save the override through the atomic RPC', async () => {
    const { db, rpcCalls } = fakeDb({ 'game_reconciliations.select': { data: recon } });
    expect(await resolveReconciliationConflict(db, 'coach-1', input))
      .toEqual({ ok: true, data: { homeGameId: GAME_ID } });
    expect(rpcCalls).toEqual([['set_reconciliation_override', {
      p_reconciliation_id: RECON_ID, p_key: 'final_score:home', p_use_away: true, p_resolved_by: 'coach-1',
    }]]);
  });
});
