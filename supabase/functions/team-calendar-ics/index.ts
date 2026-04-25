/**
 * team-calendar-ics edge function
 *
 * Serves a public subscribable ICS feed for a team's practices and games.
 * The URL is public by design (that's how calendar-subscription works in
 * Apple/Google/Outlook), but each URL carries an HMAC token scoped to the
 * team_id + current ics_token_version. Coaches rotate by bumping the version;
 * old URLs return 401.
 *
 * Request:  GET ?team=<uuid>&token=<hmac-b64url>
 * Response: text/calendar; charset=utf-8
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildIcs, IcsGame, IcsPractice } from '../_shared/ics.ts';
import { verifyIcsToken } from '../_shared/hmac.ts';

const ICS_HEADERS = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Cache-Control': 'private, max-age=300',
  // CORS is unnecessary for a feed URL (calendar clients make direct GETs,
  // not cross-origin browser fetches), so we don't pull in the _shared/cors
  // module here.
};

function textResponse(status: number, body: string, extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return textResponse(405, 'Method not allowed');
  }

  const url = new URL(req.url);
  const teamId = url.searchParams.get('team');
  const token = url.searchParams.get('token');

  if (!teamId || !token) {
    return textResponse(400, 'team and token required');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: integration, error: integrationErr } = await supabase
    .from('team_integrations')
    .select('config, is_active')
    .eq('team_id', teamId)
    .eq('service', 'calendar_ics')
    .maybeSingle();

  if (integrationErr) {
    console.error('team-calendar-ics: integration lookup failed', integrationErr);
    return textResponse(500, 'lookup failed');
  }
  if (!integration || !integration.is_active) {
    // Don't leak whether the team exists — a missing config and a bad token
    // both yield the same response.
    return textResponse(401, 'Unauthorized');
  }

  const version = Number((integration.config as Record<string, unknown>)?.ics_token_version ?? 1);
  const verification = await verifyIcsToken(teamId, token, [version]);
  if (!verification.valid) {
    return textResponse(401, 'Unauthorized');
  }

  // Fetch team name + events. Bound the window so the feed stays light:
  // 90 days back, 365 days forward.
  const nowMs = Date.now();
  const startIso = new Date(nowMs - 90 * 24 * 3600 * 1000).toISOString();
  const endIso = new Date(nowMs + 365 * 24 * 3600 * 1000).toISOString();

  const [teamResult, practicesResult, gamesResult] = await Promise.all([
    supabase.from('teams').select('name').eq('id', teamId).maybeSingle(),
    supabase
      .from('practices')
      .select('id, scheduled_at, duration_minutes, location')
      .eq('team_id', teamId)
      .gte('scheduled_at', startIso)
      .lte('scheduled_at', endIso),
    supabase
      .from('games')
      .select('id, scheduled_at, opponent_name, venue_name, location_type, status')
      .eq('team_id', teamId)
      // TBD-opponent games (NULL opponent_name) are excluded from the public
      // calendar feed — a "vs ?" entry isn't useful to subscribers, and the
      // game gets included automatically once the coach sets the opponent.
      .not('opponent_name', 'is', null)
      .gte('scheduled_at', startIso)
      .lte('scheduled_at', endIso),
  ]);

  if (teamResult.error || practicesResult.error || gamesResult.error) {
    console.error('team-calendar-ics: fetch failed', {
      team: teamResult.error,
      practices: practicesResult.error,
      games: gamesResult.error,
    });
    return textResponse(500, 'fetch failed');
  }

  const teamName = teamResult.data?.name ?? 'Team';

  const practices: IcsPractice[] = (practicesResult.data ?? []).map((p) => ({
    id: p.id as string,
    scheduledAt: p.scheduled_at as string,
    durationMinutes: (p.duration_minutes as number | null) ?? null,
    location: (p.location as string | null) ?? null,
  }));

  const games: IcsGame[] = (gamesResult.data ?? [])
    // Don't surface cancelled games in the subscribed calendar.
    .filter((g) => g.status !== 'cancelled')
    .map((g) => ({
      id: g.id as string,
      scheduledAt: g.scheduled_at as string,
      opponentName: g.opponent_name as string,
      venueName: (g.venue_name as string | null) ?? null,
      locationType: g.location_type as 'home' | 'away' | 'neutral',
    }));

  const body = buildIcs({ teamId, teamName, practices, games });

  return new Response(body, { status: 200, headers: ICS_HEADERS });
});
