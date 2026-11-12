import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeGameScorer, authorizeGameStart } from '../authorize';

const mockGetAuthorizedFinalizer = jest.fn();
const mockAuthorizeLeagueStaff = jest.fn();
jest.mock('@/lib/games/finalize', () => ({
  getAuthorizedFinalizer: (...args: unknown[]) => mockGetAuthorizedFinalizer(...args),
}));
jest.mock('../../league-admin/authorize', () => ({
  authorizeLeagueStaff: (...args: unknown[]) => mockAuthorizeLeagueStaff(...args),
}));

const GAME = { team_id: 'team-1', status: 'scheduled', opponent_name: 'Eagles' };

/** league_games matches on home_game_id; games returns the home row. */
function fakeDb(homeGameIds: string[]): SupabaseClient {
  return {
    from: (table: string) => {
      let homeGameId: string | null = null;
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (column === 'home_game_id') homeGameId = value;
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: table === 'games' ? GAME : homeGameIds.includes(homeGameId ?? '') ? { league_id: 'league-1' } : null,
            error: null,
          }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthorizedFinalizer.mockResolvedValue({ error: 'Only coaches and scorekeepers can finalize a game.', code: 'forbidden' });
  mockAuthorizeLeagueStaff.mockResolvedValue({ ok: true, data: {} });
});

describe('authorizeGameStart', () => {
  it('should let league staff start the home row of a scheduled league game', async () => {
    expect(await authorizeGameStart(fakeDb(['home-game']), 'staff', 'home-game')).toEqual({ ok: true, data: GAME });
  });

  it('should refuse league staff on the away row', async () => {
    expect(await authorizeGameStart(fakeDb(['home-game']), 'staff', 'away-game')).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('should refuse a non-league game for someone who is not its coach', async () => {
    expect(await authorizeGameStart(fakeDb([]), 'staff', 'plain-game')).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('should refuse someone who is not on the league staff', async () => {
    mockAuthorizeLeagueStaff.mockResolvedValue({ ok: false, code: 'not_found', error: 'League not found.' });
    expect(await authorizeGameStart(fakeDb(['home-game']), 'stranger', 'home-game')).toMatchObject({ ok: false });
  });

  it('should let the team\'s scorekeeper start the game (the coach-or-scorekeeper role check passes)', async () => {
    mockGetAuthorizedFinalizer.mockResolvedValue({ game: GAME });
    expect(await authorizeGameStart(fakeDb([]), 'scorekeeper', 'g')).toEqual({ ok: true, data: GAME });
    expect(mockGetAuthorizedFinalizer).toHaveBeenCalledWith(expect.anything(), 'scorekeeper', 'g');
  });

  it('should answer not_found for a game that does not exist', async () => {
    mockGetAuthorizedFinalizer.mockResolvedValue({ error: 'Game not found.', code: 'not_found' });
    expect(await authorizeGameStart(fakeDb([]), 'coach', 'missing')).toEqual({
      ok: false, code: 'not_found', error: 'Game not found.',
    });
  });

  it('should keep coach authorization as is', async () => {
    mockGetAuthorizedFinalizer.mockResolvedValue({ game: GAME });
    expect(await authorizeGameStart(fakeDb([]), 'coach', 'g')).toEqual({ ok: true, data: GAME });
    expect(mockAuthorizeLeagueStaff).not.toHaveBeenCalled();
  });
});

describe('authorizeGameScorer', () => {
  it('should say league staff got in as staff on the home row, so End Game can send them to League Games', async () => {
    expect(await authorizeGameScorer(fakeDb(['home-game']), 'staff', 'home-game')).toEqual({
      ok: true,
      data: { game: GAME, asLeagueStaff: true },
    });
  });

  it('should say a coach got in as a coach', async () => {
    mockGetAuthorizedFinalizer.mockResolvedValue({ game: GAME });
    expect(await authorizeGameScorer(fakeDb(['home-game']), 'coach', 'home-game')).toEqual({
      ok: true,
      data: { game: GAME, asLeagueStaff: false },
    });
  });

  it('should refuse league staff on the away row and on a non-league game', async () => {
    expect(await authorizeGameScorer(fakeDb(['home-game']), 'staff', 'away-game')).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await authorizeGameScorer(fakeDb([]), 'staff', 'plain-game')).toMatchObject({ ok: false, code: 'forbidden' });
  });
});
