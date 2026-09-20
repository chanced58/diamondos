import { EventType } from '../types/game-event';

/**
 * Terminal events that can only happen on a batted ball, and therefore must
 * be preceded by a PITCH_THROWN with outcome `in_play`.
 *
 * Excluded deliberately:
 *  - WALK / STRIKEOUT / DROPPED_THIRD_STRIKE / HIT_BY_PITCH — the pitch that
 *    produced them was already recorded by the pitch-outcome path.
 *  - CATCHER_INTERFERENCE — not a ball put in play, and deriveGameState
 *    groups it with WALK / HIT_BY_PITCH as an event a scorer may jump
 *    straight to with no preceding pitch. The web scorer records no pitch
 *    for it either, so including it would make the two clients disagree.
 *  - STOLEN_BASE / CAUGHT_STEALING / BALK and other runner plays — mirrors
 *    the web scorer, which records no in_play pitch for these.
 *
 * Pitch counting reads PITCH_THROWN only (see utils/pitch-count.ts), so an
 * in-play terminal without its pitch silently undercounts the pitcher.
 */
export const IN_PLAY_TERMINAL_EVENTS: readonly EventType[] = [
  EventType.HIT,
  EventType.OUT,
  EventType.SACRIFICE_FLY,
  EventType.SACRIFICE_BUNT,
  EventType.FIELD_ERROR,
  EventType.DOUBLE_PLAY,
  EventType.TRIPLE_PLAY,
] as const;

export function requiresPitchEvent(terminal: EventType): boolean {
  return IN_PLAY_TERMINAL_EVENTS.includes(terminal);
}
