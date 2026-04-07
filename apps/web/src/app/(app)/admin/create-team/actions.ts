'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createTeamSchema } from '@baseball/shared';

export async function createTeamAction(_prevState: string | null | undefined, formData: FormData) {
  // Use the cookie-based client to verify the user's identity
  const authClient = createServerClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (authError) return `Auth error: ${authError.message}`;
  if (!user) return 'Not authenticated — please log in again.';

  const raw = {
    name: formData.get('name') as string,
    organization: (formData.get('organization') as string) || undefined,
    stateCode: (formData.get('stateCode') as string) || undefined,
  };

  const coachEmail = ((formData.get('coachEmail') as string) || '').trim().toLowerCase();
  const coachFirstName = ((formData.get('coachFirstName') as string) || '').trim();
  const coachLastName = ((formData.get('coachLastName') as string) || '').trim();
  const assignDifferentCoach = coachEmail.length > 0;

  const parsed = createTeamSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.errors[0].message;
  }

  // Use the service role client to bypass RLS for trusted server-side operations.
  // The user has already been verified above via their session cookie.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Create the team
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({
      name: parsed.data.name,
      organization: parsed.data.organization ?? null,
      state_code: parsed.data.stateCode ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (teamError) return `Team insert failed: ${teamError.message}`;

  // 2. Determine coach user ID
  let coachUserId = user.id;

  if (assignDifferentCoach) {
    // Check if the coach already has an account
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === coachEmail,
    );

    if (existingUser) {
      coachUserId = existingUser.id;
    } else {
      // Invite the coach via magic link
      const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.vercel.app')}/auth/callback`;
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        coachEmail,
        { redirectTo, data: { first_name: coachFirstName, last_name: coachLastName } },
      );
      if (inviteError) return `Coach invite failed: ${inviteError.message}`;
      coachUserId = inviteData.user.id;

      // Create user profile for the invited coach
      await supabase.from('user_profiles').upsert({
        id: coachUserId,
        email: coachEmail,
        first_name: coachFirstName || null,
        last_name: coachLastName || null,
      });
    }

    // Also record in team_invitations for tracking
    await supabase.from('team_invitations').insert({
      team_id: team.id,
      email: coachEmail,
      role: 'head_coach',
      invited_by: user.id,
    });
  }

  // 3. Add coach as head_coach
  const { error: memberError } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: coachUserId, role: 'head_coach' });
  if (memberError) return `Member insert failed: ${memberError.message}`;

  // 4. Create default Announcements channel
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .insert({
      team_id: team.id,
      channel_type: 'announcement',
      name: 'Announcements',
      created_by: user.id,
    })
    .select()
    .single();
  if (channelError) return `Channel insert failed: ${channelError.message}`;

  // 5. Add coach to the channel with post permission
  const { error: cmError } = await supabase.from('channel_members').insert({
    channel_id: channel.id,
    user_id: coachUserId,
    can_post: true,
  });
  if (cmError) return `Channel member insert failed: ${cmError.message}`;

  redirect(`/teams/${team.id}/roster`);
}
