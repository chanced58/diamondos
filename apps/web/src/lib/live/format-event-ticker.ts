import { formatEventDescription } from '@baseball/shared';
import { formatPlayer, type PlayerNameMap } from './player-name-map';

type EventLike = {
  event_type: string;
  payload: unknown;
};

/**
 * Web-specific adapter over the shared, pure formatter (moved to
 * packages/shared/src/utils/format-event.ts in Task 9 so the mobile
 * play-by-play feed can reuse the same descriptions). This wrapper only
 * bridges web's snake_case DB-row event shape and its richer PlayerNameMap
 * ({lastName, jerseyNumber}) to the shared formatter's generic inputs —
 * the formatting logic itself now lives in @baseball/shared.
 */
export function formatEventTicker(event: EventLike, names: PlayerNameMap): string | null {
  return formatEventDescription(
    { eventType: event.event_type, payload: event.payload },
    (id) => formatPlayer(names, id),
  );
}
