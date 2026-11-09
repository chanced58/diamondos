import { conflictKey, type ReconciliationOverride, type ScoreConflict } from '@baseball/shared';

/**
 * How many differences between two scorebooks still need settling: conflicts
 * with no override, or none once the reconciliation is marked resolved. The one
 * definition behind the game page banner and the dashboard's pending list.
 */
export function countUnsettledConflicts(
  conflicts: readonly ScoreConflict[] | null | undefined,
  overrides: readonly ReconciliationOverride[] | null | undefined,
  resolvedAt: string | null | undefined,
): number {
  if (resolvedAt) return 0;
  const settled = new Set((overrides ?? []).map((o) => o.key));
  return (conflicts ?? []).filter((c) => !settled.has(conflictKey(c))).length;
}
