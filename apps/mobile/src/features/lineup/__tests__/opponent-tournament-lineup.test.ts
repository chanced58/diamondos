import { addNewOpponentBatter, addOpponentBatterFromRoster } from '../opponent-lineup';

const mockCreated: Array<Record<string, unknown>> = [];
jest.mock('../../../db', () => ({ database: {
  write: async (callback: () => Promise<void>) => callback(),
  batch: async (...rows: Array<Record<string, unknown>>) => { mockCreated.push(...rows); },
  get: (table: string) => ({ prepareCreate: (callback: (row: Record<string, unknown>) => void) => {
    const row = { _raw: { id: '' }, table }; callback(row); return row;
  } }),
} }));

beforeEach(() => { mockCreated.length = 0; });

it('records a rostered tournament batter at the next stable slot without pre-projecting a lineup row', async () => {
  const changes: Array<{ playerId: string; position: number }> = [];
  const result = await addOpponentBatterFromRoster({
    gameRemoteId: 'game', opponentPlayerRemoteId: 'late', maxBatters: 12,
    extension: { battingOrder: 13, record: async (playerId, position) => { changes.push({ playerId, position }); } },
  });
  expect(result).toEqual({ ok: true, opponentPlayerId: 'late', battingOrder: 13 });
  expect(changes).toEqual([{ playerId: 'late', position: 13 }]);
  expect(mockCreated).toEqual([]);
});

it('creates the opponent identity before recording its tournament extension and leaves projection to server acceptance', async () => {
  const changes: string[] = [];
  const result = await addNewOpponentBatter({ gameRemoteId: 'game', opponentTeamId: 'opponent',
    firstName: 'New', lastName: 'Batter', maxBatters: 12,
    extension: { battingOrder: 13, record: async (playerId) => {
      expect(mockCreated).toHaveLength(1);
      expect(mockCreated[0].table).toBe('opponent_players');
      changes.push(playerId);
    } },
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect(changes).toEqual([result.opponentPlayerId]);
  expect(mockCreated).toHaveLength(1);
});
