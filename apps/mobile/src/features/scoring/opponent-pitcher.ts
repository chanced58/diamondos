import { EventType, type GameEvent, type PitchingChangePayload } from '@baseball/shared';

/**
 * `startingPosition` is the abbreviation the web lineup editor writes ('P') or
 * the player_position enum value the mobile start wizard writes ('pitcher').
 */
function isPitcherPosition(position: string | null | undefined): boolean {
  const normalized = position?.trim().toLowerCase();
  return normalized === 'p' || normalized === 'pitcher';
}

/**
 * The other team's pitcher right now: the opponent lineup's P, replaced by the
 * latest pitching change recorded for their side (`isOpponentChange`).
 *
 * Unlike gameState.currentPitcherId — which INNING_CHANGE resets and mobile
 * never sets for the opponent — this persists across innings. Pass the events
 * the scorer already treats as live (voided and reverted ones removed), so a
 * voided change doesn't count. Null when nothing says who is pitching, in
 * which case events carry no opponentPitcherId.
 */
export function currentOpponentPitcherId(
  opponentSlots: ReadonlyArray<{ opponentPlayerRemoteId: string; startingPosition: string | null }>,
  events: readonly GameEvent[],
): string | null {
  let pitcherId =
    opponentSlots.find((slot) => isPitcherPosition(slot.startingPosition))?.opponentPlayerRemoteId ?? null;

  const changes = events
    .filter((event) => event.eventType === EventType.PITCHING_CHANGE)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  for (const change of changes) {
    const payload = change.payload as Partial<PitchingChangePayload>;
    if (payload.isOpponentChange && payload.newPitcherId) pitcherId = payload.newPitcherId;
  }
  return pitcherId;
}
