/**
 * practice-notifications-dispatch edge function
 *
 * Scans upcoming practices and fires a pre-practice push to eligible recipients
 * once `scheduled_at - team.practice_notification_lead_minutes` has passed.
 * Expected to be invoked on a 5-minute cron via Supabase Dashboard schedules
 * or a GitHub Action hitting /functions/v1/practice-notifications-dispatch.
 *
 * Idempotency: a row is inserted into `practice_notifications_sent` BEFORE the
 * push is queued. If this function crashes after insert but before invoke, a
 * single notification is lost; we never send duplicates on retry. That tradeoff
 * is intentional — duplicate spam is worse than a rare silent miss.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];
const WINDOW_DAYS = 7;

interface PracticeCandidate {
  id: string;
  team_id: string;
  scheduled_at: string;
  location: string | null;
  teams: {
    name: string;
    practice_notification_lead_minutes: number;
  } | Array<{ name: string; practice_notification_lead_minutes: number }> | null;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const nowIso = new Date().toISOString();
  const windowIso = new Date(Date.now() + WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('practices')
    .select(
      'id, team_id, scheduled_at, location, teams(name, practice_notification_lead_minutes)',
    )
    .gt('scheduled_at', nowIso)
    .lte('scheduled_at', windowIso);

  if (error) {
    console.error('practice-notifications-dispatch: candidates query failed', error);
    return new Response(JSON.stringify({ error: 'query_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const nowMs = Date.now();
  let practicesProcessed = 0;
  let pushesAttempted = 0;

  for (const pr of (candidates ?? []) as unknown as PracticeCandidate[]) {
    const team = Array.isArray(pr.teams) ? pr.teams[0] ?? null : pr.teams;
    const lead = team?.practice_notification_lead_minutes ?? 0;
    if (lead <= 0) continue;

    const fireAtMs = new Date(pr.scheduled_at).getTime() - lead * 60_000;
    if (fireAtMs > nowMs) continue;

    practicesProcessed += 1;

    const [playersResult, coachesResult, alreadyResult] = await Promise.all([
      supabase
        .from('players')
        .select('user_id')
        .eq('team_id', pr.team_id)
        .not('user_id', 'is', null),
      supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', pr.team_id)
        .eq('is_active', true)
        .in('role', COACH_ROLES),
      supabase
        .from('practice_notifications_sent')
        .select('user_id')
        .eq('practice_id', pr.id)
        .eq('kind', 'pre_practice'),
    ]);

    const already = new Set(
      (alreadyResult.data ?? []).map((r: { user_id: string }) => r.user_id),
    );

    const recipients = new Set<string>();
    for (const p of (playersResult.data ?? []) as Array<{ user_id: string | null }>) {
      if (p.user_id && !already.has(p.user_id)) recipients.add(p.user_id);
    }
    for (const c of (coachesResult.data ?? []) as Array<{ user_id: string }>) {
      if (c.user_id && !already.has(c.user_id)) recipients.add(c.user_id);
    }

    if (recipients.size === 0) continue;

    const userIds = [...recipients];

    // Idempotency FIRST — if push fails afterwards we lose that single send but
    // never double-send on the next cron tick.
    const { error: logErr } = await supabase
      .from('practice_notifications_sent')
      .insert(
        userIds.map((u) => ({
          practice_id: pr.id,
          user_id: u,
          kind: 'pre_practice',
        })),
      );
    if (logErr) {
      console.warn('log insert failed, skipping dispatch for practice', pr.id, logErr);
      continue;
    }

    const title = `Practice in ${lead} min`;
    const teamName = team?.name ?? '';
    const body = pr.location
      ? teamName
        ? `${teamName} · ${pr.location}`
        : pr.location
      : teamName || 'Get ready!';

    const { error: invokeErr } = await supabase.functions.invoke('push-notifications', {
      body: {
        userIds,
        title,
        body,
        data: {
          kind: 'pre_practice',
          practiceId: pr.id,
          scheduledAt: pr.scheduled_at,
        },
      },
    });
    if (invokeErr) {
      console.warn('push-notifications invoke failed for practice', pr.id, invokeErr);
    }

    pushesAttempted += userIds.length;
  }

  return new Response(
    JSON.stringify({ ok: true, practicesProcessed, pushesAttempted }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
