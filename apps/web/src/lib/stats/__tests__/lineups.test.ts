import { buildLineupsByGameId } from '../lineups';
import { fakeDb } from '@/lib/services/__tests__/fake-db';

const GAMES = [{ id: 'g1', location_type: 'home', neutral_home_team: null }];

describe('buildLineupsByGameId', () => {
  const failing = { 'game_lineups.select': { data: null, error: { message: 'timeout' } } };

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('should fall back to no lineups on a failed read by default', async () => {
    const { db } = fakeDb(failing);
    expect((await buildLineupsByGameId(db, GAMES)).size).toBe(0);
  });

  it('should throw on a failed read when strict', async () => {
    const { db } = fakeDb(failing);
    await expect(buildLineupsByGameId(db, GAMES, { strict: true })).rejects.toThrow('game_lineups query failed: timeout');
  });
});
