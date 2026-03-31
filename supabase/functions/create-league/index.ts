/**
 * create-league edge function
 *
 * Creates a new league and sets the creator as league_admin.
 * Also creates a default "League Announcements" channel.
 *
 * Request body:
 *   { name: string, description?: string, stateCode?: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Allow': 'POST' },
    });
  }

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

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (body === null || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'Request body must be a JSON object' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { name, description, stateCode } = body as Record<string, unknown>;

  if (typeof name !== 'string' || !name.trim()) {
    return new Response(JSON.stringify({ error: 'League name is required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (description != null && typeof description !== 'string') {
    return new Response(JSON.stringify({ error: 'description must be a string' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (stateCode != null) {
    if (typeof stateCode !== 'string' || !/^[A-Za-z]{2}$/.test(stateCode.trim())) {
      return new Response(JSON.stringify({ error: 'stateCode must be exactly 2 letters' }), {
        status: 400,
        headers: corsHeaders,
      });
    }
  }

  const trimmedName = name.trim();
  const trimmedDesc = typeof description === 'string' ? description.trim() : null;
  const trimmedState = typeof stateCode === 'string' ? stateCode.trim().toUpperCase() : null;

  // Create the league
  const { data: league, error: leagueError } = await serviceClient
    .from('leagues')
    .insert({
      name: trimmedName,
      description: trimmedDesc,
      state_code: trimmedState,
      created_by: user.id,
    })
    .select()
    .single();

  if (leagueError || !league) {
    console.error('Error creating league:', leagueError);
    return new Response(JSON.stringify({ error: leagueError?.message ?? 'Failed to create league' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Add creator as league_admin
  const { error: staffError } = await serviceClient.from('league_staff').insert({
    league_id: league.id,
    user_id: user.id,
    role: 'league_admin',
  });

  if (staffError) {
    console.error('Error adding league staff, rolling back league:', staffError);
    await serviceClient.from('leagues').delete().eq('id', league.id);
    return new Response(JSON.stringify({ error: staffError.message ?? 'Failed to add league admin' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Create default league announcements channel
  const { data: channel, error: channelError } = await serviceClient
    .from('league_channels')
    .insert({
      league_id: league.id,
      channel_type: 'announcement',
      name: 'League Announcements',
      description: 'Official league-wide announcements',
      created_by: user.id,
    })
    .select()
    .single();

  if (channelError || !channel) {
    console.error('Error creating league channel, rolling back:', channelError);
    await serviceClient.from('leagues').delete().eq('id', league.id);
    return new Response(JSON.stringify({ error: channelError?.message ?? 'Failed to create league channel' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Add creator as channel member with post permission
  const { error: memberError } = await serviceClient.from('league_channel_members').insert({
    league_channel_id: channel.id,
    user_id: user.id,
    can_post: true,
  });

  if (memberError) {
    console.error(`Error adding channel member (channel=${channel.id}, user=${user.id}), rolling back:`, memberError);
    await serviceClient.from('leagues').delete().eq('id', league.id);
    return new Response(JSON.stringify({ error: memberError.message ?? 'Failed to add channel member' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ league, channel }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
