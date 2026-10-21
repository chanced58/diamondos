import { fakeDb } from '../../__tests__/fake-db';
import { insertCorrectionEvents, replaceGameEvent, replayAtBat, voidGameEvent } from '../corrections';
import { loadGameHistory } from '../load-game-history';

const mockGetAuthorizedCoach = jest.fn();
jest.mock('@/lib/games/finalize', () => ({
  getAuthorizedCoach: (...args: unknown[]) => mockGetAuthorizedCoach(...args),
}));

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_A = '22222222-2222-4222-8222-222222222222';
const EVENT_B = '33333333-3333-4333-8333-333333333333';

const target = (id: string, sequence: number) => ({ id, sequence_number: sequence, inning: 3, is_top_of_inning: false });

beforeEach(() => {
  mockGetAuthorizedCoach.mockReset().mockResolvedValue({ game: { team_id: 'team-1', status: 'completed' } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const inserted = (calls: { table: string; op: string; payload?: unknown }[]) =>
  calls.filter((c) => c.table === 'game_events' && c.op === 'insert').map((c) => c.payload as Record<string, unknown>[]);

describe('voidGameEvent', () => {
  it('should append a void marker after the last event, never touching the original row', async () => {
    const { db, calls } = fakeDb({
      'game_events.select': [{ data: [target(EVENT_A, 12)] }, { data: { sequence_number: 40 } }],
    });
    const result = await voidGameEvent(db, 'coach', { gameId: GAME_ID, eventId: EVENT_A }, 'phone-1');

    expect(result).toEqual({ ok: true, data: { gameId: GAME_ID } });
    expect(calls.some((c) => c.op === 'update' || c.op === 'delete')).toBe(false);
    expect(inserted(calls)).toEqual([[
      expect.objectContaining({
        game_id: GAME_ID,
        sequence_number: 41,
        event_type: 'event_voided',
        inning: 3,
        is_top_of_inning: false,
        payload: { voidedEventId: EVENT_A, voidedSequenceNumber: 12 },
        created_by: 'coach',
        device_id: 'phone-1',
      }),
    ]]);
  });

  it("should refuse an event from another game", async () => {
    const { db, calls } = fakeDb({ 'game_events.select': { data: [] } });
    const result = await voidGameEvent(db, 'coach', { gameId: GAME_ID, eventId: EVENT_A }, 'web');
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
    expect(calls[0].filters).toMatchObject({ game_id: GAME_ID, id: [EVENT_A] });
    expect(inserted(calls)).toHaveLength(0);
  });

  it('should refuse anyone but a coach', async () => {
    mockGetAuthorizedCoach.mockResolvedValue({ error: 'Only coaches can perform this action.' });
    const { db, calls } = fakeDb();
    expect(await voidGameEvent(db, 'parent', { gameId: GAME_ID, eventId: EVENT_A }, 'web')).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('insertCorrectionEvents', () => {
  it('should append the events in order', async () => {
    const { db, calls } = fakeDb({ 'game_events.select': { data: { sequence_number: 7 } } });
    const result = await insertCorrectionEvents(db, 'coach', {
      gameId: GAME_ID,
      events: [
        { eventType: 'pitch_thrown', inning: 2, isTopOfInning: true, payload: { outcome: 'ball', insertAfterSequence: 5 } },
        { eventType: 'walk', inning: 2, isTopOfInning: true, payload: { batterId: 'b1' } },
      ],
    }, 'web');
    expect(result.ok).toBe(true);
    const [rows] = inserted(calls);
    expect(rows.map((r) => [r.sequence_number, r.event_type])).toEqual([[8, 'pitch_thrown'], [9, 'walk']]);
  });

  it('should refuse flow events that have their own paths', async () => {
    const { db, calls } = fakeDb();
    for (const eventType of ['game_start', 'game_end', 'event_voided', 'game_reset', 'nonsense']) {
      const result = await insertCorrectionEvents(db, 'coach', {
        gameId: GAME_ID,
        events: [{ eventType, inning: 1, isTopOfInning: true, payload: {} }],
      }, 'web');
      expect(result).toMatchObject({ ok: false, code: 'invalid' });
    }
    expect(calls).toHaveLength(0);
  });

  it('should retry with fresh numbers when a scorer took the same sequence', async () => {
    const { db, calls } = fakeDb({
      'game_events.select': [{ data: { sequence_number: 7 } }, { data: { sequence_number: 8 } }],
      'game_events.insert': [{ error: { code: '23505', message: 'duplicate' } }, { error: null }],
    });
    const result = await insertCorrectionEvents(db, 'coach', {
      gameId: GAME_ID,
      events: [{ eventType: 'walk', inning: 1, isTopOfInning: true, payload: {} }],
    }, 'web');
    expect(result.ok).toBe(true);
    expect(inserted(calls).map(([row]) => row.sequence_number)).toEqual([8, 9]);
  });
});

describe('replaceGameEvent', () => {
  it("should void the original and slot the replacement into its place in one insert", async () => {
    const { db, calls } = fakeDb({
      'game_events.select': [{ data: [target(EVENT_A, 12)] }, { data: { sequence_number: 40 } }],
    });
    const result = await replaceGameEvent(db, 'coach', {
      gameId: GAME_ID, eventId: EVENT_A, eventType: 'hit', payload: { batterId: 'b1', hitType: 'double' },
    }, 'web');
    expect(result.ok).toBe(true);
    const batches = inserted(calls);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      expect.objectContaining({ sequence_number: 41, event_type: 'event_voided', payload: { voidedEventId: EVENT_A, voidedSequenceNumber: 12 } }),
      expect.objectContaining({
        sequence_number: 42,
        event_type: 'hit',
        inning: 3,
        is_top_of_inning: false,
        payload: { batterId: 'b1', hitType: 'double', insertAfterSequence: 11 },
      }),
    ]);
  });
});

describe('replayAtBat', () => {
  it('should void every listed event of this game and replay the new ones in place', async () => {
    const { db, calls } = fakeDb({
      'game_events.select': [{ data: [target(EVENT_A, 20), target(EVENT_B, 21)] }, { data: { sequence_number: 50 } }],
    });
    const result = await replayAtBat(db, 'coach', {
      gameId: GAME_ID,
      voidEventIds: [EVENT_A, EVENT_B],
      newEvents: [{ eventType: 'strikeout', payload: { batterId: 'b1' } }],
      inning: 4,
      isTopOfInning: true,
      insertAfterSequence: 19,
    }, 'web');
    expect(result.ok).toBe(true);
    const [rows] = inserted(calls);
    expect(rows.map((r) => [r.sequence_number, r.event_type, r.inning])).toEqual([
      [51, 'event_voided', 4], [52, 'event_voided', 4], [53, 'strikeout', 4],
    ]);
    expect(rows[2].payload).toEqual({ batterId: 'b1', insertAfterSequence: 19 });
  });

  it('should void nothing when one of the events is not in this game', async () => {
    const { db, calls } = fakeDb({ 'game_events.select': { data: [target(EVENT_A, 20)] } });
    const result = await replayAtBat(db, 'coach', {
      gameId: GAME_ID, voidEventIds: [EVENT_A, EVENT_B], newEvents: [], inning: 4, isTopOfInning: true, insertAfterSequence: 19,
    }, 'web');
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
    expect(inserted(calls)).toHaveLength(0);
  });

  it('should reject an empty replay', async () => {
    const { db } = fakeDb();
    const result = await replayAtBat(db, 'coach', {
      gameId: GAME_ID, voidEventIds: [], newEvents: [], inning: 4, isTopOfInning: true, insertAfterSequence: 19,
    }, 'web');
    expect(result).toMatchObject({ ok: false, code: 'invalid', error: 'Nothing to do.' });
  });
});

describe('loadGameHistory', () => {
  const game = {
    id: GAME_ID, team_id: 'team-1', opponent_name: 'Eagles', location_type: 'away', neutral_home_team: null,
    status: 'in_progress', home_score: 3, away_score: 1, opponent_team_id: 'opp-1',
  };
  const event = (sequence: number, type: string) => ({
    id: `e${sequence}`, game_id: GAME_ID, sequence_number: sequence, event_type: type, inning: 1,
    is_top_of_inning: true, payload: {}, occurred_at: '2026-10-20T23:00:00Z', created_by: 'u', device_id: 'd',
  });

  it('should return the log since the last reset with names for both teams', async () => {
    const { db } = fakeDb({
      'games.select': { data: game },
      'team_members.select': { data: { role: 'player' } },
      'game_events.select': { data: [event(1, 'game_start'), event(2, 'game_reset'), event(3, 'game_start'), event(4, 'walk')] },
      'players.select': { data: [{ id: 'p1', first_name: 'Ada', last_name: 'Abbott' }] },
      'teams.select': { data: { name: 'Huskies' } },
      'opponent_players.select': { data: [{ id: 'o1', first_name: 'Ty', last_name: 'Cobb' }] },
      'game_lineups.select': { data: [{ players: { id: 'g1', first_name: 'Gus', last_name: 'Guest' } }] },
      'opponent_game_lineups.select': { data: [] },
    });

    const result = await loadGameHistory(db, 'player-user', { gameId: GAME_ID });
    expect(result).toMatchObject({
      ok: true,
      data: {
        teamName: 'Huskies',
        opponentName: 'Eagles',
        weAreHome: false,
        isCoach: false,
        playerNames: { p1: 'Ada Abbott', o1: 'Ty Cobb', g1: 'Gus Guest' },
        // Rosters for the correction tools go to coaches only.
        teamPlayers: [],
        opponentPlayers: [],
      },
    });
    if (result.ok) expect(result.data.events.map((e) => e.sequenceNumber)).toEqual([3, 4]);
  });

  it('should answer 409 before the game starts and not_found to non-members', async () => {
    const scheduled = fakeDb({ 'games.select': { data: { ...game, status: 'scheduled' } }, 'team_members.select': { data: { role: 'player' } } });
    expect(await loadGameHistory(scheduled.db, 'u', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'conflict' });
    const stranger = fakeDb({ 'games.select': { data: game }, 'team_members.select': { data: null } });
    expect(await loadGameHistory(stranger.db, 'u', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'not_found' });
  });
});
