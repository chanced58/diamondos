import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeLeagueGameScorer } from '../authorize';

const mockAuthorizeLeagueStaff = jest.fn();
jest.mock('../../league-admin/authorize', () => ({
  authorizeLeagueStaff: (...args: unknown[]) => mockAuthorizeLeagueStaff(...args),
}));
jest.mock('@/lib/games/finalize', () => ({ getAuthorizedCoach: jest.fn() }));

const HOME_GAME_ID = 'home-game';
const AWAY_GAME_ID = 'away-game';

/** league_games rows are matched on home_game_id only, as the away row never qualifies. */
function fakeDb(leagueGames: { home_game_id: string; league_id: string }[], error: unknown = null): SupabaseClient {
  return {
    from: (table: string) => {
      if (table !== 'league_games') throw new Error(`unexpected table ${table}`);
      let homeGameId: string | null = null;
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (column === 'home_game_id') homeGameId = value;
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve({ data: leagueGames.find((row) => row.home_game_id === homeGameId) ?? null, error }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const leagueGames = [{ home_game_id: HOME_GAME_ID, league_id: 'league-1' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthorizeLeagueStaff.mockResolvedValue({ ok: true, data: {} });
});

describe('authorizeLeagueGameScorer', () => {
  it('should let league staff score the home row of a league game', async () => {
    expect(await authorizeLeagueGameScorer(fakeDb(leagueGames), 'staff-1', HOME_GAME_ID)).toBe(true);
    expect(mockAuthorizeLeagueStaff).toHaveBeenCalledWith(expect.anything(), 'staff-1', 'league-1', { requireAdmin: false });
  });

  it('should refuse league staff on the away row', async () => {
    expect(await authorizeLeagueGameScorer(fakeDb(leagueGames), 'staff-1', AWAY_GAME_ID)).toBe(false);
    expect(mockAuthorizeLeagueStaff).not.toHaveBeenCalled();
  });

  it('should refuse someone who is not on the league staff', async () => {
    mockAuthorizeLeagueStaff.mockResolvedValue({ ok: false, code: 'not_found', error: 'League not found.' });
    expect(await authorizeLeagueGameScorer(fakeDb(leagueGames), 'stranger', HOME_GAME_ID)).toBe(false);
  });

  it('should refuse a game that is not a league game', async () => {
    expect(await authorizeLeagueGameScorer(fakeDb([]), 'staff-1', 'plain-game')).toBe(false);
  });

  it('should refuse when the league game cannot be read', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await authorizeLeagueGameScorer(fakeDb(leagueGames, { message: 'boom' }), 'staff-1', HOME_GAME_ID)).toBe(false);
    spy.mockRestore();
  });
});
