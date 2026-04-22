/**
 * Per-player per-drill rep log (Tier 6 F4).
 *
 * Mirrors Postgres table + enums in:
 *   supabase/migrations/20260422000012_practice_reps.sql
 */

export enum PracticeRepOutcomeCategory {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
}

export enum PracticeRepCoachTag {
  HOT = 'hot',
  COLD = 'cold',
  IMPROVED = 'improved',
  FORM_BREAK = 'form_break',
}

/**
 * Freeform outcome vocabulary. Not enforced at the DB level so coaches can
 * extend over time without migrations, but the UI defaults to this set.
 */
export const PRACTICE_REP_OUTCOMES = [
  'hit_hard',
  'line_drive',
  'weak_contact',
  'swing_miss',
  'take',
  'ground_out',
  'fly_out',
  'walk',
  'foul',
] as const;

export type PracticeRepOutcome = typeof PRACTICE_REP_OUTCOMES[number];

/** Map from outcome slug to its default rollup bucket. Used by the rep-entry UI. */
export const PRACTICE_REP_OUTCOME_DEFAULT_CATEGORY: Record<
  PracticeRepOutcome,
  PracticeRepOutcomeCategory
> = {
  hit_hard: PracticeRepOutcomeCategory.POSITIVE,
  line_drive: PracticeRepOutcomeCategory.POSITIVE,
  walk: PracticeRepOutcomeCategory.POSITIVE,
  weak_contact: PracticeRepOutcomeCategory.NEUTRAL,
  take: PracticeRepOutcomeCategory.NEUTRAL,
  foul: PracticeRepOutcomeCategory.NEUTRAL,
  swing_miss: PracticeRepOutcomeCategory.NEGATIVE,
  ground_out: PracticeRepOutcomeCategory.NEGATIVE,
  fly_out: PracticeRepOutcomeCategory.NEGATIVE,
};

export interface PracticeRepMetrics {
  exitVelo?: number;
  launchAngle?: number;
  spray?: 'pull' | 'center' | 'oppo';
  pitchTypeFaced?: string;
  [key: string]: unknown;
}

export interface PracticeRep {
  id: string;
  practiceId: string;
  blockId?: string;
  drillId?: string;
  playerId?: string;
  repNumber?: number;
  outcome: string;
  outcomeCategory: PracticeRepOutcomeCategory;
  metrics: PracticeRepMetrics;
  coachTag?: PracticeRepCoachTag;
  recordedBy?: string;
  recordedAt: string;
}

/** Draft payload when inserting a new rep (server assigns id + recordedAt). */
export interface PracticeRepInput {
  practiceId: string;
  blockId?: string;
  drillId?: string;
  playerId?: string;
  repNumber?: number;
  outcome: string;
  outcomeCategory: PracticeRepOutcomeCategory;
  metrics?: PracticeRepMetrics;
  coachTag?: PracticeRepCoachTag;
}
