import { buildSideIdMaps } from '@baseball/shared';
import { loadEventsForTeamGames } from '../paired-book';
import { fakeDb } from '@/lib/services/__tests__/fake-db';

const mockFetchEvents = jest.fn();
jest.mock('@/lib/stats/fetch-events', () => ({
  fetchAllEventsForGames: (...args: unknown[]) => mockFetchEvents(...args),
}));
const mockSideMaps = jest.fn();
jest.mock('../side-maps', () => ({ loadSideIdMaps: (...args: unknown[]) => mockSideMaps(...args) }));

const TEAM = 'team-away';
const OWN_GAME = 'game-away';
const SCORING_GAME = 'game-home';
const LEAGUE_GAME = 'lg-1';
const TYPES = ['hit'];

// The home team scored; the away team (our team) is the "other" side.
const homeBook = buildSideIdMaps({
  scoringTeamPlayerIds: ['h-1'],
  rosterRecordPlayers: [{ id: 'opp-a1', linkedPlayerId: 'a-1', isPlaceholder: false, isFillIn: false }],
  reverseLinks: new Map([['h-1', 'opp-h1']]),
});

const homeEvent = {
  id: 'e1',
  game_id: SCORING_GAME,
  sequence_number: 1,
  event_type: 'hit',
  payload: { opponentBatterId: 'opp-a1', pitcherId: 'h-1', hitType: 'single' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSideMaps.mockResolvedValue({ homeBook, awayBook: homeBook });
  mockFetchEvents.mockImplementation(async (_db: unknown, ids: string[]) =>
    ids.includes(SCORING_GAME) ? [homeEvent] : ids.map((id) => ({ id: `own-${id}`, game_id: id, payload: {} })),
  );
});

function leagueDb() {
  return fakeDb({
    'league_games.select': { data: [{ id: LEAGUE_GAME, home_game_id: SCORING_GAME, away_game_id: OWN_GAME }] },
  }).db;
}

describe('loadEventsForTeamGames', () => {
  it("should give the non-scoring team its batting from the paired book", async () => {
    const events = await loadEventsForTeamGames(
      leagueDb(),
      TEAM,
      [{ id: OWN_GAME, league_game_id: LEAGUE_GAME, result_source: 'paired' }],
      TYPES,
    );
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ batterId: 'a-1', opponentPitcherId: 'opp-h1' });
    expect(mockSideMaps).toHaveBeenCalledWith(expect.anything(), LEAGUE_GAME);
  });

  it("should re-key translated events to the team's own game id", async () => {
    const events = await loadEventsForTeamGames(
      leagueDb(),
      TEAM,
      [{ id: OWN_GAME, league_game_id: LEAGUE_GAME, result_source: 'paired' }],
      TYPES,
    );
    expect(events[0].game_id).toBe(OWN_GAME);
    expect(mockFetchEvents).toHaveBeenCalledWith(expect.anything(), [SCORING_GAME], TYPES);
  });

  it('should leave normal games untouched', async () => {
    const { db, calls } = fakeDb();
    const events = await loadEventsForTeamGames(
      db,
      TEAM,
      [{ id: 'plain', league_game_id: null, result_source: null }],
      TYPES,
    );
    expect(events).toEqual([{ id: 'own-plain', game_id: 'plain', payload: {} }]);
    expect(calls).toHaveLength(0);
    expect(mockSideMaps).not.toHaveBeenCalled();
  });

  it('should leave hand-entered results out of the event stats', async () => {
    const { db } = fakeDb();
    const events = await loadEventsForTeamGames(
      db,
      TEAM,
      [{ id: 'm', league_game_id: LEAGUE_GAME, result_source: 'manual' }],
      TYPES,
    );
    expect(events).toEqual([]);
    expect(mockFetchEvents).toHaveBeenCalledWith(expect.anything(), [], TYPES);
  });
});
