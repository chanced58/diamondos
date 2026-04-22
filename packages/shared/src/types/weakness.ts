/**
 * Game-weakness detector types (Tier 6 F2).
 *
 * Weakness codes correspond to rows in the Postgres table:
 *   supabase/migrations/20260422000013_weakness_deficit_map.sql
 * which maps each code to one or more system practice_deficit slugs.
 */

export enum WeaknessCode {
  K_VS_OFFSPEED = 'k_vs_offspeed',
  TWO_STRIKE_APPROACH = 'two_strike_approach',
  RISP_FAILURE = 'risp_failure',
  DEFENSIVE_ERRORS = 'defensive_errors',
  WALKS_ISSUED = 'walks_issued',
  LEFT_ON_BASE = 'left_on_base',
}

export enum WeaknessSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface WeaknessEvidence {
  /** Stat label rendered to the coach (e.g., "5 of 9 Ks on breaking balls"). */
  metric: string;
  value: number;
  threshold?: number;
  /** game_event ids backing this weakness; helps the UI link to specific plays. */
  eventIds?: string[];
}

export interface WeaknessSignal {
  code: WeaknessCode;
  /** Short human label shown in the takeaways panel. */
  label: string;
  /** Longer one-liner with context. */
  description: string;
  severity: WeaknessSeverity;
  /** 0–1 — raw score the detector used to rank signals. */
  score: number;
  evidence: WeaknessEvidence;
  /**
   * System-deficit slugs suggested for drill selection. Hydrated to deficit
   * ids by getGameWeaknesses() via weakness_deficit_map + practice_deficits.
   */
  suggestedDeficitSlugs: string[];
}

/** Hydrated form with resolved deficit ids — what the UI and generator consume. */
export interface HydratedWeaknessSignal extends WeaknessSignal {
  suggestedDeficitIds: string[];
}
