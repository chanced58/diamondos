/**
 * Partitions an already-sorted games array, putting in-progress games first.
 *
 * Takes a date-descending array and returns it with in_progress games moved to
 * the front, preserving relative order within each group. This is a stable
 * partition, not a re-sort—it preserves the incoming date order as the secondary
 * sort key.
 *
 * @param games - An array of game objects, already sorted by scheduled_at descending
 * @returns A new array with in_progress games first, followed by all others, each group in original relative order
 */
export function sortGamesForList<T extends { status: string }>(games: T[]): T[] {
  const inProgress: T[] = [];
  const others: T[] = [];

  for (const game of games) {
    if (game.status === 'in_progress') {
      inProgress.push(game);
    } else {
      others.push(game);
    }
  }

  return [...inProgress, ...others];
}
