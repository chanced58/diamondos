/**
 * invite-member edge function
 *
 * Invites a user to a team by email with a specified role.
 * If the user exists, adds them directly. If not, sends a magic-link invite
 * via Supabase Auth and stores a pending invitation.
 *
 * Request body:
 *   { teamId: string, email: string, role: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { teamId, email, role } = await req.json();

  if (!teamId || !email || !role) {
    return new Response(JSON.stringify({ error: 'teamId, email, and role are required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Verify the caller is a head_coach on this team
  const { data: membership } = await serviceClient
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || membership.role !== 'head_coach') {
    return new Response(JSON.stringify({ error: 'Only head coaches can invite members' }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  // Check if the user already exists in auth.users
  const { data: { users }, error: listError } = await serviceClient.auth.admin.listUsers();
  if (listError) {
    return new Response(JSON.stringify({ error: 'Failed to check user existence' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const existingUser = users.find((u: { email?: string }) => u.email === email.toLowerCase());

  if (existingUser) {
    // Refuse to add a platform admin to a team
    const { data: targetProfile } = await serviceClient
      .from('user_profiles')
      .select('is_platform_admin')
      .eq('id', existingUser.id)
      .maybeSingle();

    if (targetProfile?.is_platform_admin) {
      return new Response(
        JSON.stringify({ error: 'Platform administrators cannot be added to a team.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // User exists — add them to the team directly
    const { error: memberError } = await serviceClient.from('team_members').upsert({
      team_id: teamId,
      user_id: existingUser.id,
      role,
      is_active: true,
    }, { onConflict: 'team_id,user_id' });

    if (memberError) {
      return new Response(JSON.stringify({ error: memberError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Add to all team channels
    await addToTeamChannels(serviceClient, teamId, existingUser.id, role);

    return new Response(JSON.stringify({ added: true, userId: existingUser.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // User doesn't exist — send magic link invite
  const { data: invite, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    email.toLowerCase(),
    {
      data: { invited_to_team: teamId, invited_role: role },
      redirectTo: `${Deno.env.get('APP_URL') ?? 'https://localhost:3000'}/auth/callback?team=${teamId}&role=${role}`,
    },
  );

  if (inviteError) {
    console.error('Invite error:', inviteError);
    return new Response(JSON.stringify({ error: inviteError.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ invited: true, email }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function addToTeamChannels(
  serviceClient: ReturnType<typeof createClient>,
  teamId: string,
  userId: string,
  role: string,
): Promise<void> {
  const isCoach = ['head_coach', 'assistant_coach'].includes(role);

  // Get all channels for this team
  const { data: channels } = await serviceClient
    .from('channels')
    .select('id, channel_type')
    .eq('team_id', teamId)
    .neq('channel_type', 'direct'); // Don't auto-add to direct channels

  if (!channels) return;

  const memberships = channels.map((channel: { id: string; channel_type: string }) => ({
    channel_id: channel.id,
    user_id: userId,
    // Coaches can post in all channels; others can post in topic channels only
    can_post: isCoach || channel.channel_type === 'topic',
  }));

  await serviceClient
    .from('channel_members')
    .upsert(memberships, { onConflict: 'channel_id,user_id' });
}
