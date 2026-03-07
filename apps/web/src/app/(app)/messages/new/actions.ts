'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

export async function createChannelAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId      = formData.get('teamId') as string;
  const channelType = (formData.get('channelType') as string) || 'topic';
  const name        = (formData.get('name') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || null;

  if (!teamId) return 'Missing team ID.';
  if (!name)   return 'Channel name is required.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify coach role
  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  const isCoach = COACH_ROLES.includes(membership?.role ?? '');
  if (!isCoach) return 'Only coaches can create channels.';

  // Create channel
  const { data: channel, error } = await db
    .from('channels')
    .insert({
      team_id:      teamId,
      channel_type: channelType,
      name,
      description,
      created_by:   user.id,
    })
    .select('id')
    .single();

  if (error) return `Failed to create channel: ${error.message}`;

  // Add all team members with appropriate can_post
  const { data: teamMembers } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId);

  if (teamMembers && teamMembers.length > 0) {
    await db.from('channel_members').insert(
      teamMembers.map((m) => ({
        channel_id: channel.id,
        user_id:    m.user_id,
        can_post:   channelType === 'announcement'
          ? COACH_ROLES.includes(m.role)
          : true,
      })),
    );
  }

  redirect(`/messages/${channel.id}`);
}
