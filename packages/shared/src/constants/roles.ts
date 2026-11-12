import { UserRole } from '../types/user';

export const COACH_ROLES = [
  UserRole.HEAD_COACH,
  UserRole.ASSISTANT_COACH,
  UserRole.ATHLETIC_DIRECTOR,
] as const;

// Every value of the Postgres `team_role` enum.
export const TEAM_ROLES = Object.values(UserRole) as readonly string[];

export function isTeamRole(role: unknown): role is UserRole {
  return typeof role === 'string' && TEAM_ROLES.includes(role);
}

export function isCoachRole(role: string): boolean {
  return (COACH_ROLES as readonly string[]).includes(role);
}

// Roles that run a game's book: start it, set its lineups, record its plays,
// add guests and end it. Coaches plus scorekeepers. Mirrors the
// is_game_scorer() helper in 20261112000000_scorekeepers_run_the_book.sql.
export const SCORER_ROLES = [...COACH_ROLES, UserRole.SCOREKEEPER] as const;

export function isScorerRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (SCORER_ROLES as readonly string[]).includes(role);
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
