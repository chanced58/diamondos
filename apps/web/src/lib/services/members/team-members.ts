import type { SupabaseClient } from '@supabase/supabase-js';
import {
  memberIdInputSchema,
  parentLinkInputSchema,
  teamMembersInputSchema,
  updateMemberRoleInputSchema,
  type MemberWriteResponse,
  type TeamMembersResponse,
} from '@baseball/shared';
import { cancelTeamInvitationsForUser } from '@/lib/membership-self-heal';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeMemberManager } from './authorize';

/**
 * A team's members (the web team admin Users page), shared by its actions and
 * the mobile `/api/m/v1/teams/:teamId/members` routes: staff, parents and the
 * children they're linked to, players' app accounts, and pending invitations.
 * Member managers only (`authorizeMemberManager`). A manager doesn't change
 * or remove their own membership here, and every parent link stays within
 * the team: the parent must be on it and the child on its roster.
 */

const PLACEHOLDER_DOMAIN = '@placeholder.internal';

type MemberRow = { id: string; role: string; user_id: string };
type ProfileRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null };

function failed<T>(action: string, teamId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[members] ${action} failed team=${teamId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

export async function loadTeamMembers(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<TeamMembersResponse>> {
  const parsed = teamMembersInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const [membersResult, playersResult, invitationsResult] = await Promise.all([
    db.from('team_members').select('id, role, user_id').eq('team_id', teamId).eq('is_active', true),
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number, email, user_id')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('last_name'),
    db
      .from('team_invitations')
      .select('id, email, first_name, last_name, role, invited_at, player_ids')
      .eq('team_id', teamId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false }),
  ]);
  const firstError = membersResult.error ?? playersResult.error ?? invitationsResult.error;
  if (firstError) return failed('loadTeamMembers', teamId, actorUserId, firstError);

  const members = (membersResult.data ?? []) as MemberRow[];
  const people = members.filter((m) => m.role !== 'player');
  const parentUserIds = people.filter((m) => m.role === 'parent').map((m) => m.user_id);
  const players = (playersResult.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
    email: string | null;
    user_id: string | null;
  }>;
  const playerIds = players.map((p) => p.id);

  const [profilesResult, linksResult] = await Promise.all([
    people.length > 0
      ? db.from('user_profiles').select('id, first_name, last_name, email, phone').in('id', people.map((m) => m.user_id))
      : Promise.resolve({ data: [], error: null }),
    parentUserIds.length > 0 && playerIds.length > 0
      ? db.from('parent_player_links').select('parent_user_id, player_id').in('parent_user_id', parentUserIds).in('player_id', playerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error || linksResult.error) {
    return failed('loadTeamMembers', teamId, actorUserId, profilesResult.error ?? linksResult.error);
  }

  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  const playerNames = new Map(players.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const childrenByParent = new Map<string, Array<{ playerId: string; name: string }>>();
  for (const link of (linksResult.data ?? []) as Array<{ parent_user_id: string; player_id: string }>) {
    const children = childrenByParent.get(link.parent_user_id) ?? [];
    children.push({ playerId: link.player_id, name: playerNames.get(link.player_id) ?? 'Player' });
    childrenByParent.set(link.parent_user_id, children);
  }

  const toMember = (m: MemberRow) => {
    const profile = profiles.get(m.user_id);
    return {
      memberId: m.id,
      userId: m.user_id,
      role: m.role,
      firstName: profile?.first_name || null,
      lastName: profile?.last_name || null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
    };
  };
  const byName = (a: { lastName: string | null; firstName: string | null }, b: { lastName: string | null; firstName: string | null }) =>
    `${a.lastName ?? ''} ${a.firstName ?? ''}`.localeCompare(`${b.lastName ?? ''} ${b.firstName ?? ''}`);

  const invitations = (invitationsResult.data ?? []) as Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    invited_at: string;
    player_ids: string[] | null;
  }>;
  // A player's invite is pending when a pending player invitation records them;
  // older ones (no player_ids) match the roster email instead. Parent and staff
  // invitations at a shared address don't count.
  const playerInvitations = invitations.filter((i) => i.role === 'player');
  const pendingPlayerIds = new Set(playerInvitations.flatMap((i) => i.player_ids ?? []));
  const pendingEmails = new Set(playerInvitations.filter((i) => !i.player_ids?.length).map((i) => i.email.toLowerCase()));

  return serviceOk({
    staff: people.filter((m) => m.role !== 'parent').map(toMember).sort(byName),
    parents: people
      .filter((m) => m.role === 'parent')
      .map((m) => ({ ...toMember(m), children: childrenByParent.get(m.user_id) ?? [] }))
      .sort(byName),
    players: players.map((p) => ({
      playerId: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
      email: p.email,
      hasAccount: p.user_id !== null,
      invitePending: pendingPlayerIds.has(p.id) || (p.email !== null && pendingEmails.has(p.email.toLowerCase())),
    })),
    invitations: invitations.map((i) => ({
      invitationId: i.id,
      email: i.email.endsWith(PLACEHOLDER_DOMAIN) ? null : i.email,
      firstName: i.first_name,
      lastName: i.last_name,
      role: i.role,
      invitedAt: i.invited_at,
    })),
    ownMemberId: authorized.data.ownMemberId,
  });
}

/** The active membership on the team, refusing the actor's own. */
async function otherMember(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
  memberId: string,
  ownMemberId: string | null,
): Promise<ServiceResult<MemberRow>> {
  if (memberId === ownMemberId) return serviceError('conflict', 'You can’t change your own membership here.');
  const { data, error } = await db
    .from('team_members')
    .select('id, role, user_id')
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return failed('otherMember', teamId, actorUserId, error);
  if (!data) return serviceError('not_found', 'Member not found.');
  return serviceOk(data as MemberRow);
}

export async function updateMemberRole(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<MemberWriteResponse>> {
  const parsed = updateMemberRoleInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, memberId, role } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;
  const member = await otherMember(db, actorUserId, teamId, memberId, authorized.data.ownMemberId);
  if (!member.ok) return member;

  const { error } = await db.from('team_members').update({ role }).eq('id', memberId).eq('team_id', teamId);
  if (error) return failed('updateMemberRole', teamId, actorUserId, error);
  return serviceOk({ ok: true });
}

/** Takes someone off the team and cancels their invitations, so membership self-heal can't bring them back. */
export async function removeMember(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<MemberWriteResponse>> {
  const parsed = memberIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, memberId } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;
  const member = await otherMember(db, actorUserId, teamId, memberId, authorized.data.ownMemberId);
  if (!member.ok) return member;

  const { error } = await db.from('team_members').update({ is_active: false }).eq('id', memberId).eq('team_id', teamId);
  if (error) return failed('removeMember', teamId, actorUserId, error);
  await cancelTeamInvitationsForUser(db, teamId, member.data.user_id);
  return serviceOk({ ok: true });
}

/** A parent on the team and a player on its roster, or why not. */
async function authorizeParentLink(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
  parentUserId: string,
  playerId: string,
): Promise<ServiceResult<null>> {
  const [parentResult, playerResult] = await Promise.all([
    db
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', parentUserId)
      .eq('role', 'parent')
      .eq('is_active', true)
      .maybeSingle(),
    db.from('players').select('id').eq('id', playerId).eq('team_id', teamId).maybeSingle(),
  ]);
  if (parentResult.error || playerResult.error) {
    return failed('authorizeParentLink', teamId, actorUserId, parentResult.error ?? playerResult.error);
  }
  if (!parentResult.data) return serviceError('not_found', 'That parent isn’t on this team.');
  if (!playerResult.data) return serviceError('not_found', 'That player isn’t on this team.');
  return serviceOk(null);
}

export async function linkParent(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<MemberWriteResponse>> {
  const parsed = parentLinkInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, parentUserId, playerId } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;
  const allowed = await authorizeParentLink(db, actorUserId, teamId, parentUserId, playerId);
  if (!allowed.ok) return allowed;

  const { error } = await db
    .from('parent_player_links')
    .upsert({ parent_user_id: parentUserId, player_id: playerId }, { onConflict: 'parent_user_id,player_id', ignoreDuplicates: true });
  if (error) return failed('linkParent', teamId, actorUserId, error);
  return serviceOk({ ok: true });
}

export async function unlinkParent(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<MemberWriteResponse>> {
  const parsed = parentLinkInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, parentUserId, playerId } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  // Only a child on this team's roster: a link to another team's player is that team's to manage.
  const { data: player, error: playerError } = await db.from('players').select('id').eq('id', playerId).eq('team_id', teamId).maybeSingle();
  if (playerError) return failed('unlinkParent', teamId, actorUserId, playerError);
  if (!player) return serviceError('not_found', 'That player isn’t on this team.');

  const { error } = await db.from('parent_player_links').delete().eq('parent_user_id', parentUserId).eq('player_id', playerId);
  if (error) return failed('unlinkParent', teamId, actorUserId, error);
  return serviceOk({ ok: true });
}
