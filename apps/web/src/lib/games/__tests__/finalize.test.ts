import { fakeDb } from '@/lib/services/__tests__/fake-db';
import { finalizeGame } from '../finalize';

const mockRefreshLeagueGame = jest.fn();
const mockRunReconciliation = jest.fn();
const mockRecomputeSnapshot = jest.fn();
jest.mock('@/lib/league-games/refresh', () => ({
  refreshLeagueGame: (...args: unknown[]) => mockRefreshLeagueGame(...args),
}));
jest.mock('@/lib/dual-scorekeeper/reconcile', () => ({
  runReconciliationForGame: (...args: unknown[]) => mockRunReconciliation(...args),
}));
jest.mock('@/lib/league-snapshot/recompute', () => ({
  recomputeLeagueSnapshot: (...args: unknown[]) => mockRecomputeSnapshot(...args),
}));

const ARGS = {
  gameId: 'game-1',
  userId: 'coach-1',
  clientHomeScore: 0,
  clientAwayScore: 0,
  inning: 7,
  isTopOfInning: false,
  deviceId: 'phone',
};

/** A game whose log already ends, so finalize only completes the row and reloads it. */
const endedLog = { data: [{ event_type: 'game_start', sequence_number: 1 }, { event_type: 'game_end', sequence_number: 2 }] };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('finalizeGame', () => {
  it('should answer an error, so the phone retries, when the completed row cannot be reloaded', async () => {
    const { db, calls } = fakeDb({
      'game_events.select': endedLog,
      'games.select': { error: { message: 'connection reset' } },
    });

    const result = await finalizeGame(db, ARGS);

    expect(result).toEqual({ error: expect.any(String) });
    expect(calls.some((c) => c.table === 'games' && c.op === 'update')).toBe(true);
    expect(mockRefreshLeagueGame).not.toHaveBeenCalled();
    expect(mockRunReconciliation).not.toHaveBeenCalled();
  });

  it("should hand a league game's row to the league refresh", async () => {
    const { db } = fakeDb({
      'game_events.select': endedLog,
      'games.select': { data: { team_id: 'team-1', season_id: 'season-1', league_game_id: 'lg-1' } },
    });

    expect(await finalizeGame(db, ARGS)).toEqual({ ok: true });
    expect(mockRefreshLeagueGame).toHaveBeenCalledWith(db, 'lg-1', 'coach-1');
    expect(mockRunReconciliation).not.toHaveBeenCalled();
  });
});
