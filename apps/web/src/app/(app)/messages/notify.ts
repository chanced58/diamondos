import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Posts an alert message to the team's announcement channel.
 * Called from server actions when a coach opts in to "Notify team".
 * Silently no-ops if no announcement channel exists yet.
 */
export async function postEventAlert(
  db: SupabaseClient,
  teamId: string,
  senderId: string,
  body: string,
) {
  const { data: channel } = await db
    .from('channels')
    .select('id')
    .eq('team_id', teamId)
    .eq('channel_type', 'announcement')
    .single();

  if (!channel) return;

  await db.from('messages').insert({
    channel_id: channel.id,
    sender_id: senderId,
    body,
  });
}
