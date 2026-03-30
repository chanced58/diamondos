'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { isCoachRole, createChannelSchema } from '@baseball/shared';

export async function createChannelAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  if (!teamId) return 'Missing team ID.';

  const parsed = createChannelSchema.safeParse({
    channelType: (formData.get('channelType') as string) || 'topic',
    name:        (formData.get('name') as string)?.trim() || undefined,
    description: (formData.get('description') as string)?.trim() || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0].message;
  const { channelType, name, description } = parsed.data;
  if (!name) return 'Channel name is required.';

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
    .eq('is_active', true)
    .maybeSingle();

  const isCoach = isCoachRole(membership?.role ?? '');
  if (!isCoach) return 'Only coaches can create channels.';

  // Create channel
  const { data: channel, error } = await db
    .from('channels')
    .insert({
      team_id:      teamId,
      channel_type: channelType,
      name,
      description:   description ?? null,
      created_by:   user.id,
    })
    .select('id')
    .single();

  if (error) return `Failed to create channel: ${error.message}`;

  // Add all active team members with appropriate can_post
  const { data: teamMembers, error: membersError } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId)
    .eq('is_active', true);

  if (membersError) return `Failed to load team members: ${membersError.message}`;

  if (teamMembers && teamMembers.length > 0) {
    const { error: insertError } = await db.from('channel_members').insert(
      teamMembers.map((m) => ({
        channel_id: channel.id,
        user_id:    m.user_id,
        can_post:   channelType === 'announcement'
          ? isCoachRole(m.role)
          : true,
      })),
    );
    if (insertError) return `Failed to add members to channel: ${insertError.message}`;
  }

  revalidatePath('/messages', 'layout');
  redirect(`/messages/${channel.id}`);
}
