import { createClient } from '@supabase/supabase-js';

/**
 * Adds a user to all non-DM channels for a team.
 * Coaches get can_post on all channels; non-coaches only on topic channels.
 */
export async function addToTeamChannels(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
  userId: string,
  role: string,
): Promise<void> {
  const isCoach = ['head_coach', 'assistant_coach', 'athletic_director'].includes(role);

  const { data: channels } = await supabase
    .from('channels')
    .select('id, channel_type')
    .eq('team_id', teamId)
    .neq('channel_type', 'direct');

  if (!channels) return;

  const memberships = channels.map((ch: { id: string; channel_type: string }) => ({
    channel_id: ch.id,
    user_id: userId,
    can_post: isCoach || ch.channel_type === 'topic',
  }));

  await supabase
    .from('channel_members')
    .upsert(memberships, { onConflict: 'channel_id,user_id', ignoreDuplicates: true });
}
