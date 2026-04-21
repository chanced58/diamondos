import { UserRole } from '../types/user';

export const COACH_ROLES = [
  UserRole.HEAD_COACH,
  UserRole.ASSISTANT_COACH,
  UserRole.ATHLETIC_DIRECTOR,
] as const;

export function isCoachRole(role: string): boolean {
  return (COACH_ROLES as readonly string[]).includes(role);
}

// Roles with full practice-management privileges (create/delete blocks,
// reorder, reassign coaches, edit on completed practices). Mirrors the
// is_head_coach_or_ad() helper added in 20260421000008_practice_blocks_ownership_rls.sql.
export const HEAD_COACH_OR_AD_ROLES = [
  UserRole.HEAD_COACH,
  UserRole.ATHLETIC_DIRECTOR,
] as const;

export function isHeadCoachOrAdRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (HEAD_COACH_OR_AD_ROLES as readonly string[]).includes(role);
}
