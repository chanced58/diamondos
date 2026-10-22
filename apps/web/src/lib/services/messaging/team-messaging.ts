import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Feature,
  channelIdInputSchema,
  createTeamChannelInputSchema,
  dmCandidatesInputSchema,
  hasFeature,
  isCoachRole,
  messageIdInputSchema,
  startDirectMessageInputSchema,
  type ChannelDetailResponse,
  type DmCandidatesResponse,
} from '@baseball/shared';
import { resolveTeamTier } from '@/lib/team-tier';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';

/**
 * Team channel actions the web does with the service role — open a channel
 * (and mark it read), delete a message or channel, create a channel, start a
 * DM — shared by the web server actions and the mobile `/api/m/v1` routes.
 * Coaches are active head/assistant coaches and athletic directors, and
 * platform admins (`resolveGameViewer`). Sending a message is not here: it is
 * a direct insert under RLS on both.
 */

type ChannelRow = { id: string; team_id: string; channel_type: 'announcement' | 'topic' | 'direct'; name: string | null; description: string | null };

export async function loadChannel(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<ChannelDetailResponse>> {
  const parsed = channelIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { channelId } = parsed.data;

  // Members only, like the web channel page; anyone else learns nothing.
  const { data: membership, error: membershipError } = await db
    .from('channel_members')
    .select('can_post')
    .eq('channel_id', channelId)
    .eq('user_id', actorUserId)
    .maybeSingle();
  if (membershipError) return failed('loadChannel', channelId, actorUserId, membershipError);
  if (!membership) return serviceError('not_found', 'Channel not found.');

  const { data: channel, error: channelError } = await db
    .from('channels')
    .select('id, team_id, channel_type, name, description, channel_members(user_id, user_profiles(first_name, last_name))')
    .eq('id', channelId)
    .maybeSingle();
  if (channelError) return failed('loadChannel', channelId, actorUserId, channelError);
  if (!channel) return serviceError('not_found', 'Channel not found.');

  const [viewer, rolesResult, readResult] = await Promise.all([
    resolveGameViewer(db, actorUserId, channel.team_id as string),
    db.from('team_members').select('user_id, role').eq('team_id', channel.team_id).eq('is_active', true),
    // Opening a channel reads it, as on the web.
    db
      .from('channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', actorUserId),
  ]);
  if (rolesResult.error) return failed('loadChannel', channelId, actorUserId, rolesResult.error);
  if (readResult.error) console.warn(`[loadChannel] channel=${channelId} actor=${actorUserId} mark-read failed:`, readResult.error);

  const isCoach = viewer?.isCoach ?? false;
  // user_profiles is many-to-one, so an object at runtime; PostgREST's inferred type says array.
  const row = channel as unknown as ChannelRow & {
    channel_members: { user_id: string; user_profiles: { first_name: string; last_name: string } | null }[];
  };
  return serviceOk({
    channel: {
      id: row.id,
      teamId: row.team_id,
      channelType: row.channel_type,
      displayName: displayName(row, actorUserId),
      description: row.description ?? null,
    },
    canPost: Boolean(membership.can_post),
    isCoach,
    canDeleteChannel: isCoach && row.channel_type !== 'direct',
    memberRoles: Object.fromEntries((rolesResult.data ?? []).map((m) => [m.user_id as string, m.role as string])),
  });
}

/** A channel's name, or for a DM the other person's (the web's rule). */
function displayName(
  channel: ChannelRow & { channel_members: { user_id: string; user_profiles: { first_name: string; last_name: string } | null }[] },
  actorUserId: string,
): string {
  if (channel.channel_type !== 'direct') return channel.name ?? 'Conversation';
  const other = channel.channel_members.find((m) => m.user_id !== actorUserId)?.user_profiles;
  return other ? `${other.first_name} ${other.last_name}` : channel.name ?? 'Conversation';
}

/** Soft delete: the sender deletes their own message; a coach of the channel's team deletes any. */
export async function deleteMessage(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ messageId: string }>> {
  const parsed = messageIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { messageId } = parsed.data;

  const { data: message, error } = await db
    .from('messages')
    .select('sender_id, channel_id, channels(team_id)')
    .eq('id', messageId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return failed('deleteMessage', messageId, actorUserId, error);
  if (!message) return serviceError('not_found', 'Message not found.');

  if (message.sender_id !== actorUserId) {
    const teamId = (Array.isArray(message.channels) ? message.channels[0] : message.channels)?.team_id as string | undefined;
    const viewer = teamId ? await resolveGameViewer(db, actorUserId, teamId) : null;
    if (!viewer?.isCoach) return serviceError('forbidden', 'You can only delete your own messages.');
  }

  const { error: updateError } = await db
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: '' })
    .eq('id', messageId);
  if (updateError) return failed('deleteMessage', messageId, actorUserId, updateError);

  return serviceOk({ messageId });
}

/** Coaches delete announcement and topic channels (with their messages); DMs stay. */
export async function deleteChannel(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ channelId: string }>> {
  const parsed = channelIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { channelId } = parsed.data;

  const { data: channel, error } = await db.from('channels').select('team_id, channel_type').eq('id', channelId).maybeSingle();
  if (error) return failed('deleteChannel', channelId, actorUserId, error);
  if (!channel) return serviceError('not_found', 'Channel not found.');

  const viewer = await resolveGameViewer(db, actorUserId, channel.team_id as string);
  if (!viewer) return serviceError('not_found', 'Channel not found.');
  if (!viewer.isCoach) return serviceError('forbidden', 'Only coaches can delete channels.');
  if (channel.channel_type === 'direct') return serviceError('conflict', 'Direct message channels cannot be deleted.');

  const { error: deleteError } = await db.from('channels').delete().eq('id', channelId);
  if (deleteError) return failed('deleteChannel', channelId, actorUserId, deleteError);

  return serviceOk({ channelId });
}

/**
 * A coach creates an announcement or topic channel; every active team member
 * joins, posting in an announcement only if they coach. Topic channels need a
 * plan with topic channels, as on the web.
 */
export async function createTeamChannel(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ channelId: string }>> {
  const parsed = createTeamChannelInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, channelType, name, description } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');
  if (!viewer.isCoach) return serviceError('forbidden', 'Only coaches can create channels.');
  if (channelType === 'topic' && !hasFeature(await resolveTeamTier(db, teamId), Feature.TOPIC_CHANNELS)) {
    return serviceError('forbidden', "Topic channels aren't on this team's plan.");
  }

  const { data: members, error: membersError } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId)
    .eq('is_active', true);
  if (membersError) return failed('createTeamChannel', teamId, actorUserId, membersError);

  const { data: channel, error } = await db
    .from('channels')
    .insert({ team_id: teamId, channel_type: channelType, name, description, created_by: actorUserId })
    .select('id')
    .single();
  if (error || !channel) return failed('createTeamChannel', teamId, actorUserId, error ?? { message: 'no row returned' });

  // The creator joins even without a seat (a platform admin), so they can open it.
  const rows = new Map<string, { channel_id: string; user_id: string; can_post: boolean }>();
  for (const m of members ?? []) {
    rows.set(m.user_id as string, {
      channel_id: channel.id as string,
      user_id: m.user_id as string,
      can_post: channelType === 'announcement' ? isCoachRole(m.role as string) : true,
    });
  }
  if (!rows.has(actorUserId)) rows.set(actorUserId, { channel_id: channel.id as string, user_id: actorUserId, can_post: true });

  const { error: joinError } = await db.from('channel_members').insert([...rows.values()]);
  if (joinError) {
    // Don't leave a channel nobody can see.
    await db.from('channels').delete().eq('id', channel.id);
    return failed('createTeamChannel', teamId, actorUserId, joinError);
  }

  return serviceOk({ channelId: channel.id as string });
}

/** Who a member can start a DM with: the team's other active members (the web New Direct Message page). */
export async function listDmCandidates(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<DmCandidatesResponse>> {
  const parsed = dmCandidatesInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const gate = await authorizeDirectMessages(db, actorUserId, teamId);
  if (!gate.ok) return gate;

  const { data: members, error } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .neq('user_id', actorUserId);
  if (error) return failed('listDmCandidates', teamId, actorUserId, error);

  const ids = (members ?? []).map((m) => m.user_id as string);
  const names = new Map<string, { first_name: string; last_name: string }>();
  if (ids.length > 0) {
    const { data: profiles, error: profilesError } = await db.from('user_profiles').select('id, first_name, last_name').in('id', ids);
    if (profilesError) return failed('listDmCandidates', teamId, actorUserId, profilesError);
    for (const p of profiles ?? []) names.set(p.id as string, p as { first_name: string; last_name: string });
  }

  const people = (members ?? [])
    .filter((m) => names.has(m.user_id as string))
    .map((m) => {
      const profile = names.get(m.user_id as string)!;
      return { userId: m.user_id as string, firstName: profile.first_name, lastName: profile.last_name, role: m.role as string };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  return serviceOk({ teamId, people });
}

/** Opens the team DM between the actor and another active member, creating it the first time. */
export async function startDirectMessage(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ channelId: string }>> {
  const parsed = startDirectMessageInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, targetUserId } = parsed.data;
  if (targetUserId === actorUserId) return serviceError('invalid', "You can't message yourself.");

  const gate = await authorizeDirectMessages(db, actorUserId, teamId);
  if (!gate.ok) return gate;

  // Both people are active members of the team the DM belongs to.
  const { data: target, error: targetError } = await db
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('user_id', targetUserId)
    .eq('is_active', true)
    .maybeSingle();
  if (targetError) return failed('startDirectMessage', teamId, actorUserId, targetError);
  if (!target) return serviceError('not_found', "That person isn't on this team.");

  const { data: myDms, error: myDmsError } = await db
    .from('channel_members')
    .select('channel_id, channels!inner(team_id, channel_type)')
    .eq('user_id', actorUserId)
    .eq('channels.channel_type', 'direct')
    .eq('channels.team_id', teamId);
  if (myDmsError) return failed('startDirectMessage', teamId, actorUserId, myDmsError);

  const candidates = (myDms ?? []).map((m) => m.channel_id as string);
  if (candidates.length > 0) {
    const { data: existing, error: existingError } = await db
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', targetUserId)
      .in('channel_id', candidates)
      .limit(1)
      .maybeSingle();
    if (existingError) return failed('startDirectMessage', teamId, actorUserId, existingError);
    if (existing) return serviceOk({ channelId: existing.channel_id as string });
  }

  const { data: channel, error } = await db
    .from('channels')
    .insert({ team_id: teamId, channel_type: 'direct', name: null, created_by: actorUserId })
    .select('id')
    .single();
  if (error || !channel) return failed('startDirectMessage', teamId, actorUserId, error ?? { message: 'no row returned' });

  const { error: joinError } = await db.from('channel_members').insert([
    { channel_id: channel.id, user_id: actorUserId, can_post: true },
    { channel_id: channel.id, user_id: targetUserId, can_post: true },
  ]);
  if (joinError) {
    await db.from('channels').delete().eq('id', channel.id);
    return failed('startDirectMessage', teamId, actorUserId, joinError);
  }

  return serviceOk({ channelId: channel.id as string });
}

/**
 * An active member of a team whose plan includes direct messages. A DM is
 * between two seats on the team, so a platform admin without one can't start
 * one (the web's rule before this service).
 */
async function authorizeDirectMessages(db: SupabaseClient, actorUserId: string, teamId: string): Promise<ServiceResult<null>> {
  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');
  if (!viewer.role) return serviceError('forbidden', 'Direct messages are between members of the team.');
  if (!hasFeature(await resolveTeamTier(db, teamId), Feature.DIRECT_MESSAGES)) {
    return serviceError('forbidden', "Direct messages aren't on this team's plan.");
  }
  return serviceOk(null);
}

function failed<T = never>(service: string, id: string, actorUserId: string, error: { message?: string }): ServiceResult<T> {
  console.error(`[${service}] id=${id} actor=${actorUserId} failed:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}
