import { z } from 'zod';
import { UserRole } from '../types/user';

/**
 * Contracts for a team's members and invitations (the web team admin Users
 * page and the roster's invite forms), shared by the web actions and the
 * mobile `/api/m/v1/teams/:teamId/members` routes. Head coaches, assistants,
 * athletic directors and platform admins manage them.
 */

const uuid = z.string().uuid();
const blankToNull = (value: unknown) => (typeof value === 'string' ? value.trim() || null : value ?? null);
const optionalText = (max: number) => z.preprocess(blankToNull, z.string().max(max).nullable());
const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value ?? null),
  z.string().email('Please enter a valid email address.').nullable(),
);

/** The roles a staff invitation can give. */
export const STAFF_INVITE_ROLES = [
  UserRole.HEAD_COACH,
  UserRole.ASSISTANT_COACH,
  UserRole.ATHLETIC_DIRECTOR,
  UserRole.SCOREKEEPER,
  UserRole.STAFF,
] as const;

export const TEAM_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.HEAD_COACH]: 'Head Coach',
  [UserRole.ASSISTANT_COACH]: 'Assistant Coach',
  [UserRole.ATHLETIC_DIRECTOR]: 'Athletic Director',
  [UserRole.SCOREKEEPER]: 'Scorekeeper',
  [UserRole.STAFF]: 'Staff',
  [UserRole.PLAYER]: 'Player',
  [UserRole.PARENT]: 'Parent',
};

export const teamMembersInputSchema = z.object({ teamId: uuid });
export type TeamMembersInput = z.infer<typeof teamMembersInputSchema>;

/**
 * A staff invitation. With no email it only records the person (a
 * placeholder the roster shows); with one, an existing account joins at once
 * and a new address gets an invite email.
 */
export const inviteStaffInputSchema = z.object({
  teamId: uuid,
  email: optionalEmail,
  role: z.enum(STAFF_INVITE_ROLES),
  firstName: optionalText(50),
  lastName: optionalText(50),
  phone: optionalText(30),
  jerseyNumber: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.number().int().min(0).max(99).nullable(),
  ),
});
export type InviteStaffInput = z.input<typeof inviteStaffInputSchema>;

/** A parent invitation, for the children it names (required with an email: they are what a parent sees). */
export const inviteParentInputSchema = z
  .object({
    teamId: uuid,
    email: optionalEmail,
    firstName: optionalText(50),
    lastName: optionalText(50),
    phone: optionalText(30),
    playerIds: z.array(uuid).max(20).default([]),
  })
  .refine((invite) => !invite.email || invite.playerIds.length > 0, {
    message: 'Please select at least one player to link this parent to.',
    path: ['playerIds'],
  });
export type InviteParentInput = z.input<typeof inviteParentInputSchema>;

/** `added`: on the team now (an existing account, or a record without an email). `invited`: an invite email went out. */
export const inviteResultSchema = z.object({ outcome: z.enum(['added', 'invited']) });
export type InviteResult = z.infer<typeof inviteResultSchema>;

/**
 * Invites a rostered player to the app, or connects them to an existing
 * account: at `email` when given, else at the email on their roster entry.
 */
export const invitePlayerInputSchema = z.object({ teamId: uuid, playerId: uuid, email: optionalEmail.optional() });
export type InvitePlayerInput = z.infer<typeof invitePlayerInputSchema>;

export const invitationIdInputSchema = z.object({ teamId: uuid, invitationId: uuid });
export type InvitationIdInput = z.infer<typeof invitationIdInputSchema>;

export const memberIdInputSchema = z.object({ teamId: uuid, memberId: uuid });
export type MemberIdInput = z.infer<typeof memberIdInputSchema>;

export const updateMemberRoleInputSchema = memberIdInputSchema.extend({ role: z.nativeEnum(UserRole) });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>;

export const parentLinkInputSchema = z.object({ teamId: uuid, parentUserId: uuid, playerId: uuid });
export type ParentLinkInput = z.infer<typeof parentLinkInputSchema>;

/** A staff member or parent as the members screen lists them (`TeamMember` in types/user is the database row). */
export const teamStaffMemberSchema = z.object({
  memberId: z.string(),
  userId: z.string(),
  role: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type TeamStaffMember = z.infer<typeof teamStaffMemberSchema>;

export const teamParentSchema = teamStaffMemberSchema.extend({
  /** Their children on this team. */
  children: z.array(z.object({ playerId: z.string(), name: z.string() })),
});
export type TeamParent = z.infer<typeof teamParentSchema>;

export const teamPlayerAccountSchema = z.object({
  playerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jerseyNumber: z.number().nullable(),
  email: z.string().nullable(),
  hasAccount: z.boolean(),
  invitePending: z.boolean(),
});
export type TeamPlayerAccount = z.infer<typeof teamPlayerAccountSchema>;

export const teamInvitationSchema = z.object({
  invitationId: z.string(),
  /** Null for a record without an email (it can't be resent). */
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: z.string(),
  invitedAt: z.string(),
});
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;

export const teamMembersResponseSchema = z.object({
  staff: z.array(teamStaffMemberSchema),
  parents: z.array(teamParentSchema),
  players: z.array(teamPlayerAccountSchema),
  invitations: z.array(teamInvitationSchema),
  /** The signed-in user's own membership, which they can't change or remove here. */
  ownMemberId: z.string().nullable(),
  /** Whether they may change, remove, grant or invite the head coach and athletic director roles. */
  canManageLeadership: z.boolean().default(false),
});
export type TeamMembersResponse = z.infer<typeof teamMembersResponseSchema>;

export const memberWriteResponseSchema = z.object({ ok: z.literal(true) });
export type MemberWriteResponse = z.infer<typeof memberWriteResponseSchema>;
