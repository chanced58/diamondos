import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueChannelsForUser, getLeagueForTeam } from '@baseball/database';
import {
  leagueChannelIdInputSchema,
  leagueChannelsInputSchema,
  type LeagueChannelDetailResponse,
  type LeagueChannelsResponse,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';

/**
 * League channels for the mobile app, read the way the web does: the active
 * team's league, and only the channels the caller is a member of. The service
 * role is needed for the senders' names (league staff and coaches sit on
 * different teams, so RLS on `user_profiles` hides them from each other).
 * Posting is not here: it is a direct insert under RLS on both.
 */

/** As many as the web channel page shows. */
export const LEAGUE_MESSAGE_LIMIT = 50;

const DEFAULT_CHANNEL_NAME = 'League Channel';

type ProfileName = { first_name: string; last_name: string } | null;

export async function listLeagueChannels(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueChannelsResponse>> {
  const parsed = leagueChannelsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');

  try {
    const league = await getLeagueForTeam(db, teamId);
    if (!league) return serviceOk({ teamId, leagueName: null, channels: [] });

    const channels = await getLeagueChannelsForUser(db, league.id, actorUserId);
    return serviceOk({
      teamId,
      leagueName: league.name,
      channels: channels
        .map((ch) => ({
          id: ch.id,
          name: ch.name ?? DEFAULT_CHANNEL_NAME,
          channelType: ch.channel_type,
          description: ch.description ?? null,
          canPost: Boolean(ch.can_post),
        }))
        .sort((a, b) => Number(b.channelType === 'announcement') - Number(a.channelType === 'announcement') || a.name.localeCompare(b.name)),
    });
  } catch (error) {
    return failed('listLeagueChannels', teamId, actorUserId, error as { message?: string });
  }
}

/** A league channel the caller is in, with its latest messages. Marks it read, as the web page does. */
export async function loadLeagueChannel(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueChannelDetailResponse>> {
  const parsed = leagueChannelIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueChannelId } = parsed.data;

  // Members only, like the web channel page; anyone else learns nothing.
  const { data: membership, error: membershipError } = await db
    .from('league_channel_members')
    .select('can_post')
    .eq('league_channel_id', leagueChannelId)
    .eq('user_id', actorUserId)
    .maybeSingle();
  if (membershipError) return failed('loadLeagueChannel', leagueChannelId, actorUserId, membershipError);
  if (!membership) return serviceError('not_found', 'Channel not found.');

  const [channelResult, messagesResult] = await Promise.all([
    db.from('league_channels').select('id, league_id, channel_type, name, description').eq('id', leagueChannelId).maybeSingle(),
    db
      .from('league_messages')
      .select('id, body, sender_id, created_at, edited_at, user_profiles(first_name, last_name)')
      .eq('league_channel_id', leagueChannelId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(LEAGUE_MESSAGE_LIMIT),
  ]);
  if (channelResult.error) return failed('loadLeagueChannel', leagueChannelId, actorUserId, channelResult.error);
  if (messagesResult.error) return failed('loadLeagueChannel', leagueChannelId, actorUserId, messagesResult.error);
  const channel = channelResult.data;
  if (!channel) return serviceError('not_found', 'Channel not found.');

  const { error: readError } = await db
    .from('league_channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('league_channel_id', leagueChannelId)
    .eq('user_id', actorUserId);
  if (readError) console.warn(`[loadLeagueChannel] channel=${leagueChannelId} actor=${actorUserId} mark-read failed:`, readError);

  return serviceOk({
    channel: {
      id: channel.id as string,
      leagueId: channel.league_id as string,
      name: (channel.name as string | null) ?? DEFAULT_CHANNEL_NAME,
      channelType: channel.channel_type as LeagueChannelDetailResponse['channel']['channelType'],
      description: (channel.description as string | null) ?? null,
    },
    canPost: Boolean(membership.can_post),
    messages: (messagesResult.data ?? [])
      .map((m) => {
        // Many-to-one, so an object at runtime; PostgREST's inferred type says array.
        const raw = m.user_profiles as unknown as ProfileName | ProfileName[];
        const profile = Array.isArray(raw) ? raw[0] ?? null : raw;
        return {
          id: m.id as string,
          body: m.body as string,
          senderId: m.sender_id as string,
          senderName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Unknown',
          createdAt: m.created_at as string,
          editedAt: (m.edited_at as string | null) ?? null,
        };
      })
      .reverse(),
  });
}

function failed<T = never>(service: string, id: string, actorUserId: string, error: { message?: string }): ServiceResult<T> {
  console.error(`[${service}] id=${id} actor=${actorUserId} failed:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}
