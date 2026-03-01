import { SupabaseClient } from '@supabase/supabase-js';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

/**
 * Seeds the two default channels for a team on first visit to /messages.
 * - "Team Announcements" (announcement type): coaches can post, others read-only
 * - "General" (topic type): everyone can post
 */
export async function seedDefaultChannels(
  db: SupabaseClient,
  teamId: string,
  userId: string,
) {
  // Get all current team members
  const { data: teamMembers } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId);

  if (!teamMembers || teamMembers.length === 0) return;

  // Create "Team Announcements"
  const { data: announcementChannel } = await db
    .from('channels')
    .insert({
      team_id: teamId,
      channel_type: 'announcement',
      name: 'Team Announcements',
      description: 'Official announcements from the coaching staff.',
      created_by: userId,
    })
    .select('id')
    .single();

  // Create "General"
  const { data: generalChannel } = await db
    .from('channels')
    .insert({
      team_id: teamId,
      channel_type: 'topic',
      name: 'General',
      description: 'General team discussion.',
      created_by: userId,
    })
    .select('id')
    .single();

  if (announcementChannel) {
    await db.from('channel_members').insert(
      teamMembers.map((m) => ({
        channel_id: announcementChannel.id,
        user_id: m.user_id,
        can_post: COACH_ROLES.includes(m.role),
      })),
    );
  }

  if (generalChannel) {
    await db.from('channel_members').insert(
      teamMembers.map((m) => ({
        channel_id: generalChannel.id,
        user_id: m.user_id,
        can_post: true,
      })),
    );
  }
}
