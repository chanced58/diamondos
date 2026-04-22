import type { Game } from '../types/game';
import { GameStatus } from '../types/game';

/**
 * Returns the next game on a team's schedule — the chronologically earliest game
 * strictly after `fromDate` that is still in a playable state (scheduled, postponed).
 * In-progress games are intentionally excluded so "prep for next game" targets
 * the next scheduled outing, not an active one.
 *
 * Returns null when no such game exists.
 *
 * Pure function — input is the candidate games array (already RLS-filtered upstream);
 * no network access.
 */
export function findNextGame(games: Game[], fromDate: Date): Game | null {
  const fromIso = fromDate.toISOString();
  let best: Game | null = null;

  for (const game of games) {
    if (game.status !== GameStatus.SCHEDULED && game.status !== GameStatus.POSTPONED) {
      continue;
    }
    if (game.scheduledAt <= fromIso) continue;
    if (best === null || game.scheduledAt < best.scheduledAt) {
      best = game;
    }
  }

  return best;
}
