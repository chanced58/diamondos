/**
 * Deficit vocabulary and drill↔deficit tag types. Mirror the Postgres tables
 * and enum defined in:
 *   supabase/migrations/20260422000001_practice_deficits.sql
 *   supabase/migrations/20260422000002_practice_drill_deficit_tags.sql
 *
 * String values MUST match the DB enum labels exactly so values round-trip
 * through Supabase without mapping.
 */

import type {
  PracticeDrillVisibility,
  PracticeSkillCategory,
} from './practice-drill';

export enum PracticeDrillDeficitPriority {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
}

export interface PracticeDeficit {
  id: string;
  /** null for visibility='system'; owning team id otherwise. */
  teamId: string | null;
  visibility: PracticeDrillVisibility;
  slug: string;
  name: string;
  description?: string;
  skillCategories: PracticeSkillCategory[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeDrillDeficitTag {
  id: string;
  drillId: string;
  deficitId: string;
  /** null for system tags (seed-only); team id for team-scoped tags. */
  teamId: string | null;
  priority: PracticeDrillDeficitPriority;
  createdBy?: string;
  createdAt: string;
}

/** Shape returned by hydrating a tag with its resolved deficit. */
export interface DrillDeficitTagHydrated {
  tagId: string;
  deficit: PracticeDeficit;
  priority: PracticeDrillDeficitPriority;
  tagScope: 'system' | 'team';
}
