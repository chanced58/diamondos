/**
 * push-notifications edge function
 *
 * Sends Expo push notifications to a list of user IDs.
 * Called by other edge functions (pitch-count-calculator, game scheduling, etc.)
 *
 * Request body:
 *   {
 *     userIds: string[]          // Supabase auth user IDs
 *     title: string
 *     body: string
 *     data?: Record<string, unknown>  // extra data for deep-linking
 *   }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireInternal } from '../_shared/require-internal.ts';
import { reportEdgeError } from '../_shared/report-error.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  priority?: 'default' | 'high';
}

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const unauthorized = requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { userIds, title, body, data } = await req.json();

  if (!userIds?.length || !title || !body) {
    return new Response(JSON.stringify({ error: 'Missing required fields: userIds, title, body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch push tokens for the given user IDs
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token, user_id')
    .in('user_id', userIds);

  if (error) {
    console.error('Error fetching push tokens:', error);
    await reportEdgeError(supabase, 'edge.push', error, { step: 'fetch_tokens', recipients: userIds.length });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'No tokens registered' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const messages: PushMessage[] = tokens
    .filter((t: { token: string }) => isExpoPushToken(t.token))
    .map((t: { token: string }) => ({
      to: t.token,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
    }));

  if (messages.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'No valid Expo tokens' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Send in chunks of 100 (Expo API limit)
  const CHUNK_SIZE = 100;
  let sent = 0;
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(Deno.env.get('EXPO_ACCESS_TOKEN')
          ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` }
          : {}),
      },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      // Expo can echo push tokens in error bodies: keep only the status and error codes.
      const codes = await expoErrorCodes(response);
      const summary = `Expo push failed (${response.status})${codes.length ? `: ${codes.join(', ')}` : ''}`;
      console.error(summary);
      await reportEdgeError(supabase, 'edge.push', summary, {
        step: 'expo_send',
        status: response.status,
        chunkSize: chunk.length,
      });
    } else {
      sent += chunk.length;
    }
  }

  // Update last_used_at for sent tokens
  const sentTokens = messages.map((m) => m.to);
  await supabase
    .from('push_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .in('token', sentTokens);

  return new Response(JSON.stringify({ sent }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function expoErrorCodes(response: Response): Promise<string[]> {
  try {
    const body = await response.json();
    const errors = Array.isArray(body?.errors) ? body.errors : [];
    return errors
      .map((e: { code?: unknown }) => e?.code)
      .filter((c: unknown): c is string => typeof c === 'string')
      .map((c: string) => c.slice(0, 64));
  } catch {
    return [];
  }
}
