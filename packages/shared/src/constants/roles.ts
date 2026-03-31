import { UserRole } from '../types/user';

export const COACH_ROLES = [
  UserRole.HEAD_COACH,
  UserRole.ASSISTANT_COACH,
  UserRole.ATHLETIC_DIRECTOR,
] as const;

export function isCoachRole(role: string): boolean {
  return (COACH_ROLES as readonly string[]).includes(role);
}
