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
  // Check if channels already exist for this team (idempotency guard)
  const { data: existing } = await db
    .from('channels')
    .select('id')
    .eq('team_id', teamId)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Get all current team members (may be empty for platform-admin-only teams)
  const { data: teamMembers } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId);

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

  // Add existing team members to channels (platform admins are added separately
  // by the caller via addToTeamChannels since they can't be in team_members).
  if (teamMembers && teamMembers.length > 0) {
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
}
