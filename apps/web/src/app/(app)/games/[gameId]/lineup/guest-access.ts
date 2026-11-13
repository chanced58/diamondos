import { isCoachRole, isScorerRole } from '@baseball/shared';

/**
 * What a user may do with a game's guest players.
 *
 * - `all_teams`: add and remove guests, and search other teams' rosters for
 *   one (a service-role search across every team's active players). Coaches
 *   of the game's team and league staff scoring a league game, as before
 *   scorekeepers could add guests.
 * - `league_history`: add and remove guests, picking from the league's guest
 *   history or typing a new one, but no search of other teams' rosters. A
 *   scorekeeper runs the book, not the roster, so it gets no wider view of
 *   other teams' players than its league already shares.
 * - `none`: no guest access.
 */
export type GuestAccess = 'all_teams' | 'league_history' | 'none';

export function guestAccessFor(
  teamRole: string | null | undefined,
  isLeagueGameStaff: boolean,
): GuestAccess {
  if ((teamRole && isCoachRole(teamRole)) || isLeagueGameStaff) return 'all_teams';
  if (isScorerRole(teamRole)) return 'league_history';
  return 'none';
}
