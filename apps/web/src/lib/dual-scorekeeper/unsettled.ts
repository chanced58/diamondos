import { conflictKey, settledConflictKeys, type ReconciliationOverride, type ScoreConflict } from '@baseball/shared';

/**
 * How many differences between two scorebooks still need settling: conflicts
 * nobody decided, or none once the reconciliation is marked resolved. A
 * decision is an override either way — keeping the home value is recorded
 * (`useAwayValue: false`) as much as taking the away one. A player is settled
 * as a whole: a decision on any of their conflicts covers all of them
 * (`settledConflictKeys`), as the result takes the player's whole line from
 * one book. `resolved_at` is set only once nothing is left (see
 * `resolveReconciliationConflict`); rows marked under the older
 * one-click rule still count as settled. The one definition behind the game
 * page banner, the dashboard's pending list and League Games' "needs settling".
 */
export function countUnsettledConflicts(
  conflicts: readonly ScoreConflict[] | null | undefined,
  overrides: readonly ReconciliationOverride[] | null | undefined,
  resolvedAt: string | null | undefined,
): number {
  if (resolvedAt) return 0;
  const list = conflicts ?? [];
  const settled = settledConflictKeys(list, overrides ?? []);
  return list.filter((c) => !settled.has(conflictKey(c))).length;
}
