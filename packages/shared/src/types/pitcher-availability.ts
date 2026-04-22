/**
 * Pitcher availability types (Tier 6 F3 — bullpen planner).
 *
 * Derived, not persisted. Computed from pitch_counts + active compliance rule
 * by packages/shared/src/utils/pitcher-availability.ts.
 */

export enum PitcherAvailabilityStatus {
  AVAILABLE = 'available',
  /** Available but limited — threw recently, pitch cap below max. */
  LIMITED = 'limited',
  UNAVAILABLE = 'unavailable',
}

export interface PitcherAvailability {
  playerId: string;
  status: PitcherAvailabilityStatus;
  /**
   * ISO date (YYYY-MM-DD) when the pitcher clears their required rest. Null when
   * already available.
   */
  nextAvailableDate: string | null;
  /** Pitches thrown in the trailing 7 days. */
  pitchesLast7d: number;
  /** Most recent game pitched (YYYY-MM-DD). Omitted when there's no history. */
  lastPitchedAt?: string;
  /**
   * If status=LIMITED, the remaining pitches the rule allows without tripping
   * the next rest tier. Otherwise undefined.
   */
  remainingPitches?: number;
  /** Human-readable summary (e.g., "Threw 85 Sat → rest 4 days → clears Wed"). */
  reason: string;
}
