import { loadLeaguePlayerStats } from '../league-stats';
import { fakeDb } from '@/lib/services/__tests__/fake-db';

const mockGetLeagueTeamIds = jest.fn();
const mockGetLeagueOpponentTeamIds = jest.fn();
jest.mock('@baseball/database', () => ({
  getLeagueTeamIds: (...args: unknown[]) => mockGetLeagueTeamIds(...args),
  getLeagueOpponentTeamIds: (...args: unknown[]) => mockGetLeagueOpponentTeamIds(...args),
}));
const mockFetchEvents = jest.fn();
jest.mock('../fetch-events', () => ({ fetchAllEventsForGames: (...args: unknown[]) => mockFetchEvents(...args) }));
jest.mock('../lineups', () => ({ buildLineupsByGameId: async () => new Map() }));

// Derivers echo back one line per player they're given, named as passed in.
jest.mock('@baseball/shared', () => {
  const actual = jest.requireActual('@baseball/shared');
  const lines = (players: { id: string; firstName: string; lastName: string }[], extra: object) =>
    new Map(players.map((p) => [p.id, { playerId: p.id, playerName: `${p.firstName} ${p.lastName}`, ...extra }]));
  return {
    ...actual,
    derivePitchingStats: (_e: unknown, players: never[]) => lines(players, { inningsPitchedOuts: 3, totalPitches: 15 }),
    deriveBattingStats: (_e: unknown, players: never[]) => lines(players, { plateAppearances: 4 }),
    computeOpponentBatting: () => [
      { playerId: 'o1', playerName: 'Opp Hitter', pa: 6, ab: 5, r: 0, h: 2, doubles: 0, triples: 0, hr: 0, rbi: 1,
        bb: 1, k: 1, hbp: 0, sf: 0, sh: 0, sb: 0, cs: 0, avg: 0.4, obp: 0.5, slg: 0.4, ops: 0.9 },
      // A hitter from a non-league opponent the platform team also played.
      { playerId: 'x9', playerName: 'Unknown', pa: 9, ab: 9, r: 0, h: 3, doubles: 0, triples: 0, hr: 0, rbi: 0,
        bb: 0, k: 0, hbp: 0, sf: 0, sh: 0, sb: 0, cs: 0, avg: 0.333, obp: 0.333, slg: 0.333, ops: 0.667 },
    ],
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchEvents.mockResolvedValue([]);
  mockGetLeagueOpponentTeamIds.mockResolvedValue([]);
});

describe('loadLeaguePlayerStats', () => {
  it('should be empty for a league with no teams', async () => {
    mockGetLeagueTeamIds.mockResolvedValue([]);
    expect(await loadLeaguePlayerStats(fakeDb().db, 'l1')).toEqual({ teamCount: 0, gameCount: 0, pitching: [], batting: [] });
  });

  it('should label every player with their team and add only the league opponents', async () => {
    mockGetLeagueTeamIds.mockResolvedValue(['t1']);
    mockGetLeagueOpponentTeamIds.mockResolvedValue(['ot1']);
    const { db } = fakeDb({
      'games.select': [{ data: [{ id: 'g1', team_id: 't1' }] }, { data: [{ id: 'g1' }, { id: 'g9' }] }],
      'players.select': { data: [{ id: 'p1', team_id: 't1', first_name: 'Luke', last_name: 'Fox' }] },
      'teams.select': { data: [{ id: 't1', name: 'Huskies' }] },
      'opponent_players.select': { data: [{ id: 'o1', opponent_team_id: 'ot1', first_name: 'Opp', last_name: 'Hitter' }] },
      'opponent_teams.select': { data: [{ id: 'ot1', name: 'Eagles' }] },
    });

    const stats = await loadLeaguePlayerStats(db, 'l1');

    expect(stats).toMatchObject({ teamCount: 1, gameCount: 1 });
    expect(stats.batting.map((s) => s.playerName)).toEqual(['Opp Hitter (Eagles)', 'Luke Fox (Huskies)']);
    expect(stats.pitching.map((s) => s.playerName)).toEqual(['Luke Fox (Huskies)', 'Opp Hitter (Eagles)']);
    // Only the opponent game not already read with the platform teams is fetched again.
    expect(mockFetchEvents).toHaveBeenLastCalledWith(db, ['g9'], expect.any(Array));
  });

  it('should throw rather than show part of the league when a read fails', async () => {
    mockGetLeagueTeamIds.mockResolvedValue(['t1']);
    const { db } = fakeDb({
      'games.select': { data: [] },
      'players.select': { data: null, error: { message: 'timeout' } },
    });
    await expect(loadLeaguePlayerStats(db, 'l1')).rejects.toThrow('players query failed: timeout');
  });
});
