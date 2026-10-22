import { fakeDb } from '../../__tests__/fake-db';
import { loadLiveGame } from '../load-live-game';

const mockCanView = jest.fn();
const mockNameMap = jest.fn();
jest.mock('@/lib/live/viewer-access', () => ({
  canViewLiveGameWith: (...args: unknown[]) => mockCanView(...args),
}));
jest.mock('@/lib/live/player-name-map', () => ({
  buildLivePlayerNameMap: (...args: unknown[]) => mockNameMap(...args),
}));

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const gameRow = {
  id: GAME_ID, team_id: 'team-1', status: 'in_progress', opponent_name: 'Eagles', opponent_team_id: 'opp-1',
  scheduled_at: '2026-10-20T23:00:00.000Z', time_zone: 'America/Chicago', venue_name: 'Field 2',
  location_type: 'away', neutral_home_team: null, home_score: 3, away_score: 1,
};
const eventRow = {
  id: 'e1', game_id: GAME_ID, sequence_number: 1, event_type: 'game_start', inning: 1, is_top_of_inning: true,
  payload: { hitLocationEnabled: true }, occurred_at: '2026-10-20T23:01:00.000Z', created_by: 'u', device_id: 'd',
};

beforeEach(() => {
  mockCanView.mockReset().mockResolvedValue(true);
  mockNameMap.mockReset().mockResolvedValue({ p1: { lastName: 'Abbott', jerseyNumber: 4 } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loadLiveGame', () => {
  it('should return the game, its events and both rosters for an allowed viewer', async () => {
    const { db } = fakeDb({
      'games.select': { data: gameRow },
      'game_events.select': { data: [eventRow] },
      'teams.select': { data: { name: 'Huskies' } },
    });

    const result = await loadLiveGame(db, 'parent', { gameId: GAME_ID });

    expect(mockCanView).toHaveBeenCalledWith(db, GAME_ID, 'parent');
    expect(mockNameMap).toHaveBeenCalledWith(db, ['team-1'], ['opp-1']);
    expect(result).toEqual({
      ok: true,
      data: {
        game: {
          id: GAME_ID, teamId: 'team-1', status: 'in_progress', opponentName: 'Eagles',
          scheduledAt: '2026-10-20T23:00:00.000Z', timeZone: 'America/Chicago', venueName: 'Field 2',
          locationType: 'away', neutralHomeTeam: null, homeScore: 3, awayScore: 1,
        },
        teamName: 'Huskies',
        events: [{
          id: 'e1', gameId: GAME_ID, sequenceNumber: 1, eventType: 'game_start', inning: 1, isTopOfInning: true,
          payload: { hitLocationEnabled: true }, occurredAt: '2026-10-20T23:01:00.000Z', createdBy: 'u', deviceId: 'd',
        }],
        players: { p1: { lastName: 'Abbott', jerseyNumber: 4 } },
      },
    });
  });

  it('should hide the game from anyone the live page would not admit', async () => {
    mockCanView.mockResolvedValue(false);
    const { db, calls } = fakeDb();
    expect(await loadLiveGame(db, 'stranger', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'not_found' });
    expect(calls).toHaveLength(0);
  });

  it('should report failed reads as failures', async () => {
    const broken = fakeDb({ 'games.select': { error: { message: 'boom' } } });
    expect(await loadLiveGame(broken.db, 'u', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'failed' });

    const noEvents = fakeDb({ 'games.select': { data: gameRow }, 'game_events.select': { error: { message: 'boom' } } });
    expect(await loadLiveGame(noEvents.db, 'u', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'failed' });
  });
});
