import { fakeDb } from '@/lib/services/__tests__/fake-db';
import { loadReconciliationForGame } from '../load';

jest.mock('@/lib/services/games/resolve-reconciliation-conflict', () => ({
  authorizeReconciliationSettler: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

const RECON = {
  id: 'recon-1',
  home_game_id: 'home-game',
  away_game_id: 'away-game',
  conflicts: [
    { kind: 'final_score', side: 'away', homeLog: 1, awayLog: 2 },
    { kind: 'player_batting', playerId: 'p-ada', stat: 'hits', homeLog: 1, awayLog: 2 },
    { kind: 'player_pitching', playerId: 'p-bo', stat: 'strikeouts', homeLog: 3, awayLog: 4 },
  ],
  resolved_overrides: [],
  resolved_at: null,
};

describe('loadReconciliationForGame', () => {
  it("should resolve the conflicts' players to names", async () => {
    const { db, calls } = fakeDb({
      'game_reconciliations.select': { data: RECON },
      'games.select': { data: [] },
      'players.select': {
        data: [
          { id: 'p-ada', first_name: 'Ada', last_name: 'Abbott' },
          { id: 'p-bo', first_name: 'Bo', last_name: null },
        ],
      },
    });
    const view = await loadReconciliationForGame(db, 'home-game', 'coach');
    expect(view?.playerNames).toEqual({ 'p-ada': 'Ada Abbott', 'p-bo': 'Bo' });
    expect(calls.find((c) => c.table === 'players')?.filters).toEqual({ id: ['p-ada', 'p-bo'] });
    expect(view?.unsettledCount).toBe(3);
  });

  it('should fall back to no names when the lookup fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db } = fakeDb({
      'game_reconciliations.select': { data: RECON },
      'games.select': { data: [] },
      'players.select': { error: { message: 'boom' } },
    });
    const view = await loadReconciliationForGame(db, 'home-game', 'coach');
    expect(view?.playerNames).toEqual({});
  });
});
