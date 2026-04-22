/**
 * pitch-count-calculator edge function
 *
 * Triggered via a Supabase Database Webhook on game_events INSERT.
 * For every pitch_thrown event, this function:
 *   1. Aggregates the total pitch count for that pitcher in the game
 *   2. Upserts the pitch_counts row
 *   3. Checks compliance thresholds and dispatches push notifications if needed
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { resolveEffectiveTier } from '../_shared/resolve-tier.ts';

interface GameEventRecord {
  id: string;
  game_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let record: GameEventRecord;
  try {
    const body = await req.json();
    record = body.record as GameEventRecord;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Only process pitch_thrown events
  if (record.event_type !== 'pitch_thrown') {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const pitcherId = record.payload?.pitcherId as string;
  if (!pitcherId) {
    return new Response(JSON.stringify({ error: 'Missing pitcherId in payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const gameId = record.game_id;

  // 1. Count total pitches by this pitcher in this game
  const { count, error: countError } = await supabase
    .from('game_events')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('event_type', 'pitch_thrown')
    .eq('payload->>pitcherId', pitcherId);

  if (countError) {
    console.error('Error counting pitches:', countError);
    return new Response(JSON.stringify({ error: countError.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const pitchCount = count ?? 0;

  // 2. Fetch game date and season for compliance lookup
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('season_id, scheduled_at, team_id')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    console.error('Error fetching game:', gameError);
    return new Response(JSON.stringify({ error: 'Game not found' }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  const gameDate = game.scheduled_at.split('T')[0];

  // 3. Upsert pitch_counts row
  const { error: upsertError } = await supabase.from('pitch_counts').upsert(
    {
      game_id: gameId,
      player_id: pitcherId,
      season_id: game.season_id,
      game_date: gameDate,
      pitch_count: pitchCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'game_id,player_id' },
  );

  if (upsertError) {
    console.error('Error upserting pitch count:', upsertError);
    return new Response(JSON.stringify({ error: upsertError.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // 4. Check subscription tier — skip compliance alerts for free tier
  const effectiveTier = await resolveEffectiveTier(supabase, game.team_id);

  // Free tier: pitch counts are tracked but compliance alerts are not sent
  if (effectiveTier === 'free') {
    return new Response(JSON.stringify({ pitchCount, tier: 'free', alertsSkipped: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 5. Resolve compliance rule: per-player override → DOB auto-match → season default.
  //    Tier 8 F1 replaces the season-only lookup so travel / mixed-age rosters work.
  const { data: ruleIdResult } = await supabase.rpc('resolve_compliance_rule_for_player', {
    p_player_id: pitcherId,
    p_game_date: gameDate,
  });
  const ruleId = ruleIdResult as string | null;

  let rule: { max_pitches_per_day: number; max_pitches_per_week: number | null } | null = null;
  if (ruleId) {
    const { data: ruleRow } = await supabase
      .from('pitch_compliance_rules')
      .select('max_pitches_per_day, max_pitches_per_week')
      .eq('id', ruleId)
      .maybeSingle();
    rule = ruleRow ?? null;
  }

  if (rule) {
    const dispatchAlert = async (title: string, body: string, alertType: string) => {
      const { data: coaches } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', game.team_id)
        .in('role', ['head_coach', 'assistant_coach'])
        .eq('is_active', true);

      if (!coaches || coaches.length === 0) return;
      await supabase.functions.invoke('push-notifications', {
        body: {
          userIds: coaches.map((c: { user_id: string }) => c.user_id),
          title,
          body,
          data: { gameId, pitcherId, pitchCount, type: alertType },
        },
      });
    };

    // Daily threshold alerts (75% / 90%)
    const max = rule.max_pitches_per_day;
    const warningThreshold = Math.floor(max * 0.75);
    const dangerThreshold = Math.floor(max * 0.9);

    if (pitchCount === warningThreshold || pitchCount === dangerThreshold) {
      const severity = pitchCount >= dangerThreshold ? 'danger' : 'warning';
      const emoji = severity === 'danger' ? '🔴' : '🟡';
      await dispatchAlert(
        `${emoji} Pitch Count Alert`,
        `Pitcher has thrown ${pitchCount} pitches today (limit: ${max})`,
        'pitch_count_alert',
      );
    }

    // Weekly rolling-7d threshold alerts (only when the rule has a weekly cap)
    if (rule.max_pitches_per_week) {
      const { data: rolling } = await supabase
        .from('v_pitcher_rolling_7d')
        .select('pitches_7d')
        .eq('player_id', pitcherId)
        .eq('game_date', gameDate)
        .maybeSingle();

      const pitches7d = (rolling?.pitches_7d as number | null) ?? pitchCount;
      const weeklyMax = rule.max_pitches_per_week;
      const weeklyWarn = Math.floor(weeklyMax * 0.75);
      const weeklyDanger = Math.floor(weeklyMax * 0.9);

      // Mirror the daily pattern: fire exactly when the rolling total lands on
      // the threshold. One alert per threshold crossing.
      if (pitches7d === weeklyWarn || pitches7d === weeklyDanger) {
        const severity = pitches7d >= weeklyDanger ? 'danger' : 'warning';
        const emoji = severity === 'danger' ? '🔴' : '🟡';
        await dispatchAlert(
          `${emoji} Weekly Pitch Limit Alert`,
          `Pitcher at ${pitches7d} pitches over the last 7 days (weekly limit: ${weeklyMax})`,
          'pitch_count_weekly_alert',
        );
      }
    }
  }

  return new Response(JSON.stringify({ pitchCount }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
