import { summarizeRsvps } from '../game-rsvp-summary';
import type { GameRsvp } from '../../types/game-rsvp';

function rsvp(playerId: string, status: GameRsvp['status']): Pick<GameRsvp, 'playerId' | 'status'> {
  return { playerId, status };
}

describe('summarizeRsvps', () => {
  it('returns all zeros for an empty roster', () => {
    expect(summarizeRsvps([], [])).toEqual({
      attending: 0,
      notAttending: 0,
      maybe: 0,
      pending: 0,
      total: 0,
    });
  });

  it('treats every roster player with no RSVP as pending', () => {
    const summary = summarizeRsvps(['p1', 'p2', 'p3'], []);
    expect(summary).toEqual({
      attending: 0,
      notAttending: 0,
      maybe: 0,
      pending: 3,
      total: 3,
    });
  });

  it('counts a mix of statuses and remaining pending players', () => {
    const summary = summarizeRsvps(
      ['p1', 'p2', 'p3', 'p4', 'p5'],
      [
        rsvp('p1', 'attending'),
        rsvp('p2', 'attending'),
        rsvp('p3', 'not_attending'),
        rsvp('p4', 'maybe'),
      ],
    );
    expect(summary).toEqual({
      attending: 2,
      notAttending: 1,
      maybe: 1,
      pending: 1,
      total: 5,
    });
  });

  it('ignores RSVPs for players no longer on the roster', () => {
    const summary = summarizeRsvps(['p1'], [rsvp('p1', 'attending'), rsvp('off-roster', 'maybe')]);
    expect(summary).toEqual({
      attending: 1,
      notAttending: 0,
      maybe: 0,
      pending: 0,
      total: 1,
    });
  });

  it('always sums status counts to the total', () => {
    const summary = summarizeRsvps(
      ['p1', 'p2', 'p3'],
      [rsvp('p1', 'attending'), rsvp('p2', 'not_attending')],
    );
    const sum = summary.attending + summary.notAttending + summary.maybe + summary.pending;
    expect(sum).toBe(summary.total);
  });
});
