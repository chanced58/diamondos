import type { TypedSupabaseClient } from '../client';
import type { Database } from '../types/supabase';

type MessageInsert = Database['public']['Tables']['messages']['Insert'];

export async function getChannelsForTeam(client: TypedSupabaseClient, teamId: string) {
  const { data, error } = await client
    .from('channels')
    .select('*, channel_members!inner(user_id, can_post)')
    .eq('team_id', teamId)
    .eq('channel_members.user_id', (await client.auth.getUser()).data.user?.id ?? '');
  if (error) throw error;
  return data;
}

export async function getMessagesForChannel(
  client: TypedSupabaseClient,
  channelId: string,
  limit = 50,
) {
  const { data, error } = await client
    .from('messages')
    .select('*, user_profiles!sender_id(*)')
    .eq('channel_id', channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function sendMessage(client: TypedSupabaseClient, message: MessageInsert) {
  const { data, error } = await client.from('messages').insert(message).select().single();
  if (error) throw error;
  return data;
}

export async function markChannelRead(
  client: TypedSupabaseClient,
  channelId: string,
  userId: string,
) {
  const { error } = await client
    .from('channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', userId);
  if (error) throw error;
}
