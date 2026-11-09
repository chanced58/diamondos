/**
 * Which opponent players a scorer may pick for one game. On a league game the
 * opponent is the other team's league roster record, which also holds the
 * unknown players (placeholders) scorers added during every league game: a
 * placeholder belongs only to the league game it was added in, and a fill-in
 * (settled as someone off the roster) is never picked again. Shared by the
 * web pickers and the mobile scorer.
 */

export interface PickableOpponentPlayer {
  /** The league game the row was added in as an unknown player; null/undefined for a roster player. */
  placeholderGameId?: string | null;
  isFillIn?: boolean | null;
}

/**
 * True when the player may be picked for the game whose league game is
 * `leagueGameId` (null/undefined for a game that is not a league game, which
 * hides every placeholder).
 */
export function isPickableOpponentPlayer(
  player: PickableOpponentPlayer,
  leagueGameId: string | null | undefined,
): boolean {
  if (player.isFillIn) return false;
  return !player.placeholderGameId || player.placeholderGameId === leagueGameId;
}

/** The roster filtered to the players `isPickableOpponentPlayer` allows, in order. */
export function visibleOpponentRoster<T extends PickableOpponentPlayer>(
  roster: readonly T[],
  leagueGameId: string | null | undefined,
): T[] {
  return roster.filter((player) => isPickableOpponentPlayer(player, leagueGameId));
}
