/**
 * create-team edge function
 *
 * Creates a new team. If the creator is a regular user, they are added as
 * head_coach. If the creator is a platform admin, no team_members row is
 * created — platform admins access all teams implicitly via is_platform_admin.
 * Also creates the team's default "Announcements" channel.
 * Uses service role to bypass RLS for the initial team setup.
 *
 * Request body:
 *   { name: string, organization?: string, stateCode?: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Verify the caller is authenticated
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

  const { name, organization, stateCode } = await req.json();
  if (!name?.trim()) {
    return new Response(JSON.stringify({ error: 'Team name is required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Create the team
  const { data: team, error: teamError } = await serviceClient
    .from('teams')
    .insert({
      name: name.trim(),
      organization: organization?.trim() ?? null,
      state_code: stateCode?.toUpperCase() ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (teamError || !team) {
    console.error('Error creating team:', teamError);
    return new Response(JSON.stringify({ error: teamError?.message ?? 'Failed to create team' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Check if the creator is a platform admin
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();

  const isPlatformAdmin = profile?.is_platform_admin === true;

  // Only add a team_members row for non-admin creators.
  // Platform admins get implicit access to all teams via is_platform_admin —
  // they must not hold a team_members row.
  if (!isPlatformAdmin) {
    await serviceClient.from('team_members').insert({
      team_id: team.id,
      user_id: user.id,
      role: 'head_coach',
    });
  }

  // Create default announcements channel
  const { data: channel } = await serviceClient
    .from('channels')
    .insert({
      team_id: team.id,
      channel_type: 'announcement',
      name: 'Announcements',
      description: 'Official team announcements from coaches',
      created_by: user.id,
    })
    .select()
    .single();

  // Add head coach as channel member with post permission (non-admin creators only)
  if (channel && !isPlatformAdmin) {
    await serviceClient.from('channel_members').insert({
      channel_id: channel.id,
      user_id: user.id,
      can_post: true,
    });
  }

  return new Response(JSON.stringify({ team, channel }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
