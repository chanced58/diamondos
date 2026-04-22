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
  // Compare as numeric timestamps rather than ISO strings so differing ISO
  // serializations (e.g. '+00:00' vs 'Z') can't reorder equivalent instants.
  const fromMs = fromDate.getTime();
  let best: Game | null = null;
  let bestMs = Number.POSITIVE_INFINITY;

  for (const game of games) {
    if (game.status !== GameStatus.SCHEDULED && game.status !== GameStatus.POSTPONED) {
      continue;
    }
    const scheduledMs = Date.parse(game.scheduledAt);
    if (Number.isNaN(scheduledMs)) continue;
    if (scheduledMs <= fromMs) continue;
    if (scheduledMs < bestMs) {
      best = game;
      bestMs = scheduledMs;
    }
  }

  return best;
}
