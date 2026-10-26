import { inviteParentInputSchema, inviteStaffInputSchema, type InviteResult } from '@baseball/shared';
import type { ParentInvite, StaffInvite } from './members-api';

/**
 * The invite staff and invite parent forms: text as typed, checked with the
 * shared schemas the server uses (the team id is the server's to fill in).
 */

const PLACEHOLDER_TEAM = '00000000-0000-4000-8000-000000000000';

export interface StaffInviteValues {
  email: string;
  role: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  jerseyNumber: string;
}

export const emptyStaffInvite: StaffInviteValues = { email: '', role: null, firstName: '', lastName: '', phone: '', jerseyNumber: '' };

export interface ParentInviteValues {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  playerIds: string[];
}

export const emptyParentInvite: ParentInviteValues = { email: '', firstName: '', lastName: '', phone: '', playerIds: [] };

function firstIssue(error: { issues: Array<{ message: string; path: Array<string | number> }> }): string {
  const issue = error.issues[0];
  if (issue?.path[0] === 'role') return 'Pick a role.';
  if (issue?.path[0] === 'jerseyNumber') return 'Jersey numbers run 0–99.';
  return issue?.message ?? 'Check the form.';
}

export function toStaffInvite(values: StaffInviteValues): { invite: StaffInvite } | { error: string } {
  const jersey = values.jerseyNumber.trim();
  const parsed = inviteStaffInputSchema.safeParse({
    teamId: PLACEHOLDER_TEAM,
    email: values.email,
    role: values.role ?? undefined,
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    jerseyNumber: jersey === '' ? null : /^\d+$/.test(jersey) ? Number(jersey) : Number.NaN,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { email, role, firstName, lastName, phone, jerseyNumber } = parsed.data;
  return { invite: { email, role, firstName, lastName, phone, jerseyNumber } };
}

export function toParentInvite(values: ParentInviteValues): { invite: ParentInvite } | { error: string } {
  const parsed = inviteParentInputSchema.safeParse({ teamId: PLACEHOLDER_TEAM, ...values });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { email, firstName, lastName, phone, playerIds } = parsed.data;
  return { invite: { email, firstName, lastName, phone, playerIds } };
}

/** What the coach is told after an invite. */
export function inviteOutcomeMessage(result: InviteResult, email: string | null): string {
  if (result.outcome === 'invited') return `We emailed an invite to ${email}. They join the team when they accept.`;
  return email ? 'They already had an account and are on the team now.' : 'Added to the team’s list. Invite them by email any time.';
}
