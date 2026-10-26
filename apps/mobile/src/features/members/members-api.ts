import { useQuery } from '@tanstack/react-query';
import {
  inviteResultSchema,
  memberWriteResponseSchema,
  teamMembersResponseSchema,
  type InviteResult,
  type MemberWriteResponse,
  type TeamMembersResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * A team's members and invitations through `/api/m/v1/teams/:teamId`
 * (online-only): the web team admin Users page and the roster's invite forms.
 */

const teamPath = (teamId: string) => `/teams/${encodeURIComponent(teamId)}`;

/** Cache key for a team's members. */
export const teamMembersQueryKey = (teamId: string) => ['teams', teamId, 'members'] as const;

export function fetchTeamMembers(teamId: string, client: ApiClient = apiClient): Promise<TeamMembersResponse> {
  return client.get(`${teamPath(teamId)}/members`, teamMembersResponseSchema);
}

export interface StaffInvite {
  email: string | null;
  role: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  jerseyNumber: number | null;
}

export function inviteStaff(teamId: string, invite: StaffInvite, client: ApiClient = apiClient): Promise<InviteResult> {
  return client.post(`${teamPath(teamId)}/invitations/staff`, invite, inviteResultSchema);
}

export interface ParentInvite {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  playerIds: string[];
}

export function inviteParent(teamId: string, invite: ParentInvite, client: ApiClient = apiClient): Promise<InviteResult> {
  return client.post(`${teamPath(teamId)}/invitations/parent`, invite, inviteResultSchema);
}

/** Invites a player at `email`, else the email on their roster entry. */
export function invitePlayer(teamId: string, playerId: string, email: string | null, client: ApiClient = apiClient): Promise<InviteResult> {
  return client.post(`${teamPath(teamId)}/invitations/player`, email ? { playerId, email } : { playerId }, inviteResultSchema);
}

export function resendInvitation(teamId: string, invitationId: string, client: ApiClient = apiClient): Promise<MemberWriteResponse> {
  return client.post(`${teamPath(teamId)}/invitations/${encodeURIComponent(invitationId)}/resend`, {}, memberWriteResponseSchema);
}

export function cancelInvitation(teamId: string, invitationId: string, client: ApiClient = apiClient): Promise<MemberWriteResponse> {
  return client.delete(`${teamPath(teamId)}/invitations/${encodeURIComponent(invitationId)}`, memberWriteResponseSchema);
}

export function updateMemberRole(teamId: string, memberId: string, role: string, client: ApiClient = apiClient): Promise<MemberWriteResponse> {
  return client.patch(`${teamPath(teamId)}/members/${encodeURIComponent(memberId)}`, { role }, memberWriteResponseSchema);
}

export function removeMember(teamId: string, memberId: string, client: ApiClient = apiClient): Promise<MemberWriteResponse> {
  return client.delete(`${teamPath(teamId)}/members/${encodeURIComponent(memberId)}`, memberWriteResponseSchema);
}

export function linkParent(teamId: string, parentUserId: string, playerId: string, client: ApiClient = apiClient): Promise<MemberWriteResponse> {
  return client.post(`${teamPath(teamId)}/parent-links`, { parentUserId, playerId }, memberWriteResponseSchema);
}

export function unlinkParent(teamId: string, parentUserId: string, playerId: string, client: ApiClient = apiClient): Promise<MemberWriteResponse> {
  return client.delete(
    `${teamPath(teamId)}/parent-links/${encodeURIComponent(parentUserId)}/${encodeURIComponent(playerId)}`,
    memberWriteResponseSchema,
  );
}

export function useTeamMembers(teamId: string | null) {
  return useQuery({
    queryKey: teamMembersQueryKey(teamId ?? ''),
    queryFn: () => fetchTeamMembers(teamId as string),
    enabled: Boolean(teamId),
  });
}

/** "Pat Lee", or the email, or a fallback for someone recorded without either. */
export function displayName(person: { firstName: string | null; lastName: string | null; email?: string | null }): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ');
  return name || person.email || 'Unnamed';
}
