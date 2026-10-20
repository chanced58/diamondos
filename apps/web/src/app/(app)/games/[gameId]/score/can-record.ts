/**
 * Whether the web scorer has enough attribution to record a plate-appearance
 * event. Our own batter and pitcher are always required (their stats and
 * pitch counts depend on it). The opponent side is optional when the opponent
 * is untracked — no opponent batting order, as on games started on mobile,
 * which records those halves without an opponent batter or pitcher — and an
 * opponent batter may also be skipped explicitly for the current slot.
 */
export function canRecordPlay(input: {
  isOpponentBatting: boolean;
  activeBatterId: string | null;
  activePitcherId: string | null;
  opponentTracked: boolean;
  opponentSlotSkipped: boolean;
}): boolean {
  const batterResolved =
    input.activeBatterId != null ||
    (input.isOpponentBatting && (!input.opponentTracked || input.opponentSlotSkipped));
  const pitcherResolved =
    input.activePitcherId != null || (!input.isOpponentBatting && !input.opponentTracked);
  return batterResolved && pitcherResolved;
}
