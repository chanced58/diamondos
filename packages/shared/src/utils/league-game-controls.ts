/**
 * Which of a team's game controls a league game's row refuses. A league game
 * belongs to the league: its time, venue and opponent change, and it is
 * cancelled, from League Games; and a row whose result the league wrote
 * (`result_source` set) has no book of its own to recalculate or reset. A
 * finished league book is not reset either, since the league result, the
 * other team's row and the standings are built on it. Shared by the web
 * services (which refuse with `conflict`), the web game page and the mobile
 * game screen (which hide the buttons).
 */

export type GameControl = 'edit' | 'cancel' | 'reset' | 'recalculate';

export interface GameControlRow {
  status: string;
  league_game_id?: string | null;
  result_source?: string | null;
}

const LEAGUE_RESULT = "This game's result was set by the league, not by this team's play-by-play.";

/** Why `control` is refused on this game, or null when it is allowed. */
export function leagueGameControlRefusal(control: GameControl, game: GameControlRow): string | null {
  const isLeagueGame = Boolean(game.league_game_id);
  switch (control) {
    case 'edit':
      return isLeagueGame ? 'Edit league games from League Games.' : null;
    case 'cancel':
      return isLeagueGame ? 'League admins cancel league games from League Games.' : null;
    case 'recalculate':
      return game.result_source ? LEAGUE_RESULT : null;
    case 'reset':
      if (game.result_source) return LEAGUE_RESULT;
      return isLeagueGame && game.status === 'completed' ? "A finished league game can't be reset." : null;
  }
}
