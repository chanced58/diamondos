/**
 * Opponent scouting tags — structured scouting vocabulary.
 *
 * Mirrors Postgres table + enums defined in:
 *   supabase/migrations/20260422000011_opponent_scouting_tags.sql
 *
 * String values match the DB enum labels exactly so they round-trip through
 * Supabase without mapping.
 */

export enum OpponentScoutingCategory {
  PITCH_MIX = 'pitch_mix',
  PITCHER_HANDEDNESS = 'pitcher_handedness',
  BATTER_PROFILE = 'batter_profile',
  APPROACH = 'approach',
  BASERUNNING = 'baserunning',
  DEFENSE = 'defense',
}

export enum OpponentScoutingSource {
  MANUAL = 'manual',
  AUTO_DERIVED = 'auto_derived',
}

export interface OpponentScoutingTag {
  id: string;
  opponentTeamId: string;
  category: OpponentScoutingCategory;
  tagValue: string;
  note?: string;
  source: OpponentScoutingSource;
  /** 0–1; only set on source='auto_derived' rows. */
  confidence?: number;
  /** Freeform evidence payload. Auto-derived tags include { gameIds[], sampleSize, ... }. */
  evidence: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Shape returned from deriveOpponentTendencies() — pre-insertion, so no ids.
 * Coach can review before persisting.
 */
export interface DerivedScoutingTag {
  category: OpponentScoutingCategory;
  tagValue: string;
  note?: string;
  confidence: number;
  evidence: Record<string, unknown>;
}
