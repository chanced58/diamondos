import type { HistoryEvent, LiveGameResponse } from '@baseball/shared';
import {
  livePlayerLabel,
  liveScore,
  liveState,
  liveTeams,
  mergeEvent,
  recentPlays,
  sinceLastReset,
  type GameEventRow,
} from '../live-model';

let seq = 0;
const ev = (eventType: string, payload: Record<string, unknown> = {}, isTopOfInning = true): HistoryEvent => {
  seq += 1;
  return {
    id: `e${seq}`, gameId: 'g1', sequenceNumber: seq, eventType, inning: 1, isTopOfInning, payload,
    occurredAt: '2026-10-20T23:00:00Z', createdBy: 'u', deviceId: 'd',
  };
};

const data = (events: HistoryEvent[], over: Partial<LiveGameResponse['game']> = {}): LiveGameResponse => ({
  game: {
    id: 'g1', teamId: 't1', status: 'in_progress', opponentName: 'Eagles', scheduledAt: '2026-10-20T23:00:00Z',
    timeZone: null, venueName: null, locationType: 'home', neutralHomeTeam: null, homeScore: 9, awayScore: 9, ...over,
  },
  teamName: 'Huskies',
  events,
  players: { b1: { lastName: 'Abbott', jerseyNumber: 4 }, p1: { lastName: 'Cobb', jerseyNumber: '07' } },
});

beforeEach(() => {
  seq = 0;
});

describe('live state', () => {
  it('should replay only what follows the last reset', () => {
    const events = [ev('pitch_thrown', { outcome: 'ball' }), ev('game_reset'), ev('game_start'), ev('pitch_thrown', { outcome: 'ball' })];
    expect(sinceLastReset(events).map((e) => e.sequenceNumber)).toEqual([3, 4]);
    expect(liveState(data(events)).balls).toBe(1);
  });

  it('should score from the derived state while live and from the stored final otherwise', () => {
    const live = data([ev('game_start')]);
    expect(liveScore(live, liveState(live))).toEqual({ home: 0, away: 0 });
    const final = data([ev('game_start')], { status: 'completed', homeScore: 5, awayScore: 2 });
    expect(liveScore(final, liveState(final))).toEqual({ home: 5, away: 2 });
  });

  it('should put us on the side we bat from', () => {
    expect(liveTeams(data([]))).toEqual({ away: 'Eagles', home: 'Huskies', weAreHome: true });
    expect(liveTeams(data([], { locationType: 'away', opponentName: null }))).toEqual({ away: 'Huskies', home: 'TBD', weAreHome: false });
  });
});

describe('plays', () => {
  it('should list described plays newest first, skipping corrections, up to the limit', () => {
    const events = [
      ev('game_start'),
      ev('hit', { batterId: 'b1', pitcherId: 'p1', hitType: 'double' }),
      ev('event_voided', { voidedEventId: 'nope' }),
      ev('walk', { batterId: 'b1' }),
    ];
    const plays = recentPlays(data(events), 2);
    expect(plays.map((p) => p.id)).toEqual(['e4', 'e2']);
    expect(plays[1].text).toContain('#4 Abbott');
  });

  it('should label players with their jersey, and unknowns with a dash', () => {
    const { players } = data([]);
    expect(livePlayerLabel(players, 'p1')).toBe('#07 Cobb');
    expect(livePlayerLabel(players, 'nobody')).toBe('—');
    expect(livePlayerLabel(players, null)).toBe('—');
  });
});

describe('mergeEvent', () => {
  const row = (id: string, sequence: number): GameEventRow => ({
    id, game_id: 'g1', sequence_number: sequence, event_type: 'pitch_thrown', inning: 1, is_top_of_inning: true,
    payload: { outcome: 'ball' }, occurred_at: '2026-10-20T23:00:00Z', created_by: null, device_id: null,
  });

  it('should add a Realtime row in sequence order and ignore a duplicate', () => {
    const start = data([ev('game_start'), ev('pitch_thrown', { outcome: 'ball' }), ev('pitch_thrown', { outcome: 'ball' })]);
    const merged = mergeEvent(start, row('late', 2.5));
    expect(merged.events.map((e) => e.id)).toEqual(['e1', 'e2', 'late', 'e3']);
    expect(mergeEvent(merged, row('late', 2.5))).toBe(merged);
  });
});
