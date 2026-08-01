import type { GameRsvp, GameRsvpSummary, GameRsvpStatus } from '../types/game-rsvp';

/**
 * Merges roster player ids against RSVP rows: any roster player without a
 * matching RSVP is "pending" (lazy model — no row = no response yet).
 * RSVPs for players no longer on the roster are ignored.
 */
export function summarizeRsvps(
  rosterPlayerIds: readonly string[],
  rsvps: readonly Pick<GameRsvp, 'playerId' | 'status'>[],
): GameRsvpSummary {
  const rosterIds = new Set(rosterPlayerIds);
  const statusByPlayer = new Map<string, GameRsvpStatus>();
  for (const rsvp of rsvps) {
    if (rosterIds.has(rsvp.playerId)) {
      statusByPlayer.set(rsvp.playerId, rsvp.status);
    }
  }

  const summary: GameRsvpSummary = {
    attending: 0,
    notAttending: 0,
    maybe: 0,
    pending: 0,
    total: rosterIds.size,
  };

  for (const playerId of rosterIds) {
    const status = statusByPlayer.get(playerId);
    if (status === 'attending') summary.attending += 1;
    else if (status === 'not_attending') summary.notAttending += 1;
    else if (status === 'maybe') summary.maybe += 1;
    else summary.pending += 1;
  }

  return summary;
}
