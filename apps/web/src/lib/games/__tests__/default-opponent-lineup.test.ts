import { fakeDb } from '@/lib/services/__tests__/fake-db';
import { ensureDefaultOpponentLineup } from '../default-opponent-lineup';

const game = (over: Record<string, unknown> = {}) => ({
  team_id: 'team-1',
  opponent_name: 'Eagles',
  opponent_team_id: 'opp-1',
  league_game_id: null,
  ...over,
});

const writes = (calls: { op: string }[]) => calls.filter((c) => c.op !== 'select');

describe('ensureDefaultOpponentLineup', () => {
  it('should leave a league game with no opponent order untouched', async () => {
    const { db, calls } = fakeDb();
    expect(await ensureDefaultOpponentLineup(db, { gameId: 'g', game: game({ league_game_id: 'lg-1' }), userId: 'u' })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('should not pad or order a league roster record on a game that is not a league game', async () => {
    const { db, calls } = fakeDb({
      'opponent_game_lineups.select': { count: 0 },
      'opponent_teams.select': { data: { league_id: 'league-1', linked_team_id: 'team-2' } },
    });
    expect(await ensureDefaultOpponentLineup(db, { gameId: 'g', game: game(), userId: 'u' })).toBeNull();
    expect(writes(calls)).toHaveLength(0);
  });

  it('should pad a normal opponent to 15 players and bat the first nine', async () => {
    const { db, calls } = fakeDb({
      'opponent_game_lineups.select': { count: 0 },
      'opponent_teams.select': { data: { league_id: null, linked_team_id: null } },
      'opponent_players.select': { data: [{ id: 'p1' }] },
      'opponent_players.insert': { data: Array.from({ length: 14 }, (_, i) => ({ id: `d${i + 2}` })) },
    });
    expect(await ensureDefaultOpponentLineup(db, { gameId: 'g', game: game(), userId: 'u' })).toBeNull();
    const padded = calls.find((c) => c.table === 'opponent_players' && c.op === 'insert')?.payload as unknown[];
    expect(padded).toHaveLength(14);
    expect(padded[0]).toEqual({ opponent_team_id: 'opp-1', first_name: 'Player', last_name: '2' });
    const order = calls.find((c) => c.table === 'opponent_game_lineups' && c.op === 'insert')?.payload as Record<string, unknown>[];
    expect(order).toHaveLength(9);
    expect(order[0]).toMatchObject({ game_id: 'g', opponent_player_id: 'p1', batting_order: 1, starting_position: 'pitcher' });
  });

  it('should keep an order the coach already entered', async () => {
    const { db, calls } = fakeDb({ 'opponent_game_lineups.select': { count: 4 } });
    expect(await ensureDefaultOpponentLineup(db, { gameId: 'g', game: game(), userId: 'u' })).toBeNull();
    expect(writes(calls)).toHaveLength(0);
  });
});
