import {
  deriveBattingStats,
  derivePitchingStats,
  PLACEHOLDER_PREFIX,
  translateBookForSide,
  type BattingLineupContext,
  type BattingStats,
  type GameEvent,
  type PitchingStats,
  type SideIdMap,
} from '@baseball/shared';

/** One team's batting and pitching lines from one book, keyed by real player id or `placeholder:` id. */
export interface SideStats {
  batting: Map<string, BattingStats>;
  pitching: Map<string, PitchingStats>;
}

export interface DeriveSideStatsInput {
  /** One team's book of a league game: active events (reverted and reset ones already dropped). */
  events: Record<string, unknown>[];
  /** How the book's ids read from the side being derived. */
  sideMap: SideIdMap;
  /** Name lookup for the reducers. */
  sidePlayers: { id: string; firstName: string; lastName: string }[];
  /** The scoring team's lineup for the book, when deriving the scoring team's own side. */
  lineup: BattingLineupContext | undefined;
}

function keepWhere<T>(lines: Map<string, T>, keep: (id: string) => boolean): Map<string, T> {
  return new Map([...lines].filter(([id]) => keep(id)));
}

/** The lineup context for every game id in the book (a book is one game, so normally one). */
function lineupsFor(
  events: Record<string, unknown>[],
  lineup: BattingLineupContext | undefined,
): Map<string, BattingLineupContext> | undefined {
  if (!lineup) return undefined;
  const gameIds = new Set(events.map((event) => String(event.game_id ?? event.gameId)));
  return new Map([...gameIds].map((gameId) => [gameId, lineup]));
}

/**
 * One side's batting and pitching lines from a league game book. The book is
 * read from that side (`translateBookForSide`), then only that side's players
 * are kept: its real players (`sideMap.toOurPlayer` values) and its
 * `placeholder:` ids. Anything else the reducers credited — the other team's
 * ids that stayed raw, say — is dropped, so a player is credited only to the
 * side they batted or pitched for in this book.
 */
export function deriveSideStats(input: DeriveSideStatsInput): SideStats {
  const translated = translateBookForSide(input.events, input.sideMap) as unknown as GameEvent[];
  const sideIds = new Set(input.sideMap.toOurPlayer.values());
  const isSideId = (id: string) => sideIds.has(id) || id.startsWith(PLACEHOLDER_PREFIX);
  return {
    batting: keepWhere(deriveBattingStats(translated, input.sidePlayers, lineupsFor(input.events, input.lineup)), isSideId),
    pitching: keepWhere(derivePitchingStats(translated, input.sidePlayers), isSideId),
  };
}
