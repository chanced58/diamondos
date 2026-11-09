import { provisionMirrorGame } from '../provision';
import { fakeDb } from '@/lib/services/__tests__/fake-db';

const game = {
  id: 'g1',
  team_id: 't1',
  opponent_team_id: 'o1',
  scheduled_at: '2026-11-11T02:00:00.000Z',
  location_type: 'home',
  neutral_home_team: null,
  venue_name: null,
  season_id: null,
};

describe('provisionMirrorGame', () => {
  it('should not provision a mirror for a team-created game in a league that schedules games', async () => {
    const { db, calls } = fakeDb({
      'league_members.select': { data: { leagues: { schedules_games: true } } },
    });
    expect(await provisionMirrorGame(db, game, 'u1')).toBeNull();
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
    expect(calls.some((c) => c.table === 'opponent_teams')).toBe(false);
  });
});
