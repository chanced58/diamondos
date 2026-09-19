import type { Href } from 'expo-router';

/**
 * Pure merge/normalise logic for the Schedule tab, extracted out of
 * `app/(tabs)/schedule.tsx` so it is directly testable without standing up
 * WatermelonDB, Supabase, or React Native Testing Library — per the pattern
 * `fetch-game-events.ts` already uses for score.tsx (see its file header).
 *
 * Schedule merges three sources with very different failure/offline
 * characteristics:
 *  - games: read from WatermelonDB (offline-capable, mirrored locally).
 *  - practices, events (team_events): read from Supabase (online-only —
 *    neither table is in the sync engine's pull payload).
 *
 * `buildScheduleState` takes each source as an already-resolved
 * `ScheduleFetchOutcome` (success-with-rows, or failed) and decides:
 *  - the merged, sorted `items` list (only from sources that succeeded),
 *  - whether to show the full-page error (nothing at all to show), or
 *  - an inline partial-failure banner (some items to show, but not all
 *    sources came back).
 *
 * H4 (the finding this fixes): the screen used to swallow every fetch error
 * with `console.warn` and fall through to `data ?? []`, so a coach offline
 * saw "No upcoming events." instead of an error. `buildScheduleState` is the
 * seam that makes that distinction explicit and testable.
 */

export type ScheduleItemKind = 'game' | 'practice' | 'event';

export interface ScheduleItem {
  id: string;
  kind: ScheduleItemKind;
  /** ISO 8601 string — always, regardless of source. Games arrive from
   * WatermelonDB as a Unix-ms number and must be normalised before reaching
   * this type, because the merged list is sorted with `localeCompare`. */
  startsAt: string;
  title: string;
  detail: string | null;
  href?: Href;
}

/** The subset of a WatermelonDB `Game` row `mapGameToScheduleItem` needs. */
export interface ScheduleGameRow {
  remoteId: string;
  teamId: string;
  opponentName: string;
  /** Unix ms — `Game.scheduledAt`'s WatermelonDB type. */
  scheduledAt: number;
  status: string;
}

export interface SchedulePracticeRow {
  id: string;
  scheduled_at: string;
  location: string | null;
  run_status: string;
}

export interface ScheduleEventRow {
  id: string;
  starts_at: string;
  title: string;
  location: string | null;
}

/** Statuses for which a game opens somewhere; matches games/index.tsx and
 * the pre-fix schedule.tsx behavior exactly. */
const OPENABLE_GAME_STATUSES = ['scheduled', 'in_progress', 'completed'];

export function mapGameToScheduleItem(game: ScheduleGameRow): ScheduleItem {
  return {
    id: `game:${game.remoteId}`,
    kind: 'game',
    startsAt: new Date(game.scheduledAt).toISOString(),
    title: `Game vs ${game.opponentName || 'TBD'}`,
    detail: game.status,
    href: OPENABLE_GAME_STATUSES.includes(game.status)
      ? ({
          pathname: '/(tabs)/games/[gameId]/score',
          params: {
            gameId: game.remoteId,
            teamId: game.teamId,
            opponentName: game.opponentName || 'TBD',
          },
        } as const)
      : undefined,
  };
}

export function mapPracticeToScheduleItem(practice: SchedulePracticeRow): ScheduleItem {
  return {
    id: `practice:${practice.id}`,
    kind: 'practice',
    startsAt: practice.scheduled_at,
    title: 'Practice',
    detail: practice.location ?? practice.run_status,
  };
}

export function mapEventToScheduleItem(event: ScheduleEventRow): ScheduleItem {
  return {
    id: `event:${event.id}`,
    kind: 'event',
    startsAt: event.starts_at,
    title: event.title,
    detail: event.location,
  };
}

/** One source's resolved outcome: the rows it produced (empty on failure)
 * plus whether it failed. Callers resolve their own fetch (WatermelonDB
 * `.fetch()` try/catch, or a Supabase `{ data, error }` response) into this
 * shape before calling `buildScheduleState`. */
export interface ScheduleFetchOutcome<T> {
  data: T[];
  failed: boolean;
}

export interface BuildScheduleStateParams {
  games: ScheduleFetchOutcome<ScheduleGameRow>;
  practices: ScheduleFetchOutcome<SchedulePracticeRow>;
  events: ScheduleFetchOutcome<ScheduleEventRow>;
}

export interface ScheduleState {
  items: ScheduleItem[];
  /** Set when there is nothing at all to show — replaces the whole list
   * with the full-page error state. */
  fullPageError: string | null;
  /** Set when some items loaded but not everything did — rendered as an
   * inline banner above the (non-empty) list. */
  partialError: string | null;
}

export const SCHEDULE_FULL_PAGE_ERROR = "Couldn't load your schedule.";
export const SCHEDULE_PARTIAL_ERROR = "Practices and events couldn't be loaded.";

export function buildScheduleState({
  games,
  practices,
  events,
}: BuildScheduleStateParams): ScheduleState {
  const items = [
    ...games.data.map(mapGameToScheduleItem),
    ...practices.data.map(mapPracticeToScheduleItem),
    ...events.data.map(mapEventToScheduleItem),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const anyFailed = games.failed || practices.failed || events.failed;
  if (!anyFailed) {
    return { items, fullPageError: null, partialError: null };
  }
  if (items.length === 0) {
    return { items, fullPageError: SCHEDULE_FULL_PAGE_ERROR, partialError: null };
  }
  return { items, fullPageError: null, partialError: SCHEDULE_PARTIAL_ERROR };
}
