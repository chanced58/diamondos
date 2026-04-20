/**
 * maxpreps-export edge function
 *
 * Generates a MaxPreps-compatible TXT file for a completed game.
 * The file is tab-delimited and matches MaxPreps Score Reporter specifications.
 *
 * Request body: { gameId: string }
 * Response: text/plain file download
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { gameId } = await req.json();
  if (!gameId) {
    return new Response(JSON.stringify({ error: 'gameId is required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Fetch game info
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(`
      *,
      seasons (
        name,
        teams (name, organization, state_code)
      )
    `)
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    return new Response(JSON.stringify({ error: 'Game not found' }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  // Fetch batting stats aggregated from game_events
  const { data: events } = await supabase
    .from('game_events')
    .select('event_type, payload, inning, is_top_of_inning')
    .eq('game_id', gameId)
    .order('sequence_number');

  // Aggregate per-player stats from events
  const playerStats = aggregateStats(events ?? []);

  // Fetch player names
  const playerIds = [...playerStats.keys()];
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .in('id', playerIds);

  const playerMap = new Map((players ?? []).map((p: { id: string; first_name: string; last_name: string; jersey_number: number }) => [p.id, p]));

  // Format MaxPreps TXT (simplified spec — actual MaxPreps spec requires
  // account-specific school and team IDs which must be configured by the coach)
  const gameDate = new Date(game.scheduled_at).toLocaleDateString('en-US');
  const teamName = (game.seasons as { teams: { name: string; organization: string } })?.teams?.name ?? 'Team';
  const opponent = game.opponent_name;
  const homeScore = game.home_score;
  const awayScore = game.away_score;

  const lines: string[] = [
    '# MaxPreps Game Score Export',
    `# Generated: ${new Date().toISOString()}`,
    `# Game: ${teamName} vs ${opponent} — ${gameDate}`,
    `# Final Score: ${homeScore}-${awayScore}`,
    '',
    // Header row
    'PlayerID\tPlayerName\tJersey\tAB\tR\tH\t2B\t3B\tHR\tRBI\tBB\tSO\tAVG',
  ];

  for (const [playerId, stats] of playerStats.entries()) {
    const player = playerMap.get(playerId);
    if (!player) continue;
    const avg = stats.ab > 0 ? (stats.h / stats.ab).toFixed(3) : '.000';
    lines.push(
      [
        playerId,
        `${player.first_name} ${player.last_name}`,
        player.jersey_number ?? '',
        stats.ab,
        stats.r,
        stats.h,
        stats.doubles,
        stats.triples,
        stats.hr,
        stats.rbi,
        stats.bb,
        stats.so,
        avg,
      ].join('\t'),
    );
  }

  const txt = lines.join('\n');

  return new Response(txt, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="game-${gameId}-maxpreps.txt"`,
    },
  });
});

interface PlayerStats {
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
}

function aggregateStats(events: Array<{ event_type: string; payload: Record<string, unknown>; is_top_of_inning: boolean }>): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>();

  // Runner tracking for RBI auto-derive (OBR 9.04). Mirrors the logic in
  // packages/shared/src/utils/batting-stats.ts so the MaxPreps export stays
  // consistent with what the app displays.
  let r1: string | null = null;
  let r2: string | null = null;
  let r3: string | null = null;

  function get(id: string): PlayerStats {
    if (!stats.has(id)) {
      stats.set(id, { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 });
    }
    return stats.get(id)!;
  }
  function scoreRunner(id: string | null) { if (id) get(id).r++; }
  function clearBases() { r1 = null; r2 = null; r3 = null; }
  function forceAdvance(batterId: string) {
    if (r1 && r2 && r3) scoreRunner(r3);
    if (r1 && r2) r3 = r2;
    if (r1) r2 = r1;
    r1 = batterId;
  }
  function creditRbi(batterStats: PlayerStats, payload: Record<string, unknown>, autoDerived: number) {
    const explicit = payload.rbis as number | undefined;
    batterStats.rbi += explicit !== undefined ? explicit : autoDerived;
  }

  for (const event of events) {
    const p = event.payload;
    const etype = event.event_type;

    if (etype === 'inning_change') { clearBases(); continue; }

    const batterId = p.batterId as string | undefined;

    if (etype === 'hit') {
      if (!batterId) continue;
      const s = get(batterId);
      const hitType = p.hitType as string;
      const fieldersChoice = p.fieldersChoice === true;
      s.ab++;
      if (!fieldersChoice) {
        s.h++;
        if (hitType === 'double') s.doubles++;
        else if (hitType === 'triple') s.triples++;
        else if (hitType === 'home_run') s.hr++;
      }
      const bases = hitType === 'home_run' ? 4
        : hitType === 'triple' ? 3
        : hitType === 'double' ? 2
        : 1;
      let runsScored = 0;
      if (bases === 4) {
        if (r3) runsScored++;
        if (r2) runsScored++;
        if (r1) runsScored++;
        runsScored++;
        scoreRunner(r3); scoreRunner(r2); scoreRunner(r1); scoreRunner(batterId);
        clearBases();
      } else {
        if (r3) { scoreRunner(r3); runsScored++; }
        if (r2 && 2 + bases >= 4) { scoreRunner(r2); runsScored++; }
        if (r1 && 1 + bases >= 4) { scoreRunner(r1); runsScored++; }
        if (bases === 1) { r3 = r2 ?? null; r2 = r1; r1 = batterId; }
        else if (bases === 2) { r3 = r1 ?? null; r2 = batterId; r1 = null; }
        else if (bases === 3) { r3 = batterId; r2 = null; r1 = null; }
      }
      creditRbi(s, p, runsScored);
      continue;
    }

    if (etype === 'out') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++;
      if (p.outType === 'strikeout') s.so++;
      creditRbi(s, p, 0);
      continue;
    }

    if (etype === 'strikeout') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++; s.so++;
      continue;
    }

    if (etype === 'double_play' || etype === 'triple_play') {
      if (!batterId) continue;
      get(batterId).ab++;
      if (etype === 'double_play') {
        const runnerOutBase = p.runnerOutBase as number | undefined;
        if (runnerOutBase === 1) r1 = null;
        else if (runnerOutBase === 2) r2 = null;
        else if (runnerOutBase === 3) r3 = null;
      }
      continue;
    }

    if (etype === 'walk') {
      if (!batterId) continue;
      const s = get(batterId);
      s.bb++;
      const forcedRun = !!(r1 && r2 && r3);
      forceAdvance(batterId);
      creditRbi(s, p, forcedRun ? 1 : 0);
      continue;
    }

    if (etype === 'hit_by_pitch' || etype === 'catcher_interference') {
      if (!batterId) continue;
      const s = get(batterId);
      const forcedRun = !!(r1 && r2 && r3);
      forceAdvance(batterId);
      creditRbi(s, p, forcedRun ? 1 : 0);
      continue;
    }

    if (etype === 'sacrifice_fly') {
      if (!batterId) continue;
      const s = get(batterId);
      const runScored = !!r3;
      if (r3) { scoreRunner(r3); r3 = null; }
      creditRbi(s, p, runScored ? 1 : 0);
      continue;
    }

    if (etype === 'sacrifice_bunt') {
      if (!batterId) continue;
      const s = get(batterId);
      const runScored = !!r3;
      if (r3) scoreRunner(r3);
      r3 = r2 ?? null;
      r2 = r1;
      r1 = null;
      creditRbi(s, p, runScored ? 1 : 0);
      continue;
    }

    if (etype === 'field_error') {
      if (!batterId) continue;
      get(batterId).ab++;
      forceAdvance(batterId);
      continue;
    }

    if (etype === 'dropped_third_strike') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++; s.so++;
      if (p.outcome !== 'thrown_out') forceAdvance(batterId);
      continue;
    }

    if (etype === 'stolen_base') {
      const runnerId = p.runnerId as string | undefined;
      const toBase = p.toBase as number | undefined;
      if (!runnerId || !toBase) continue;
      if (r1 === runnerId) r1 = null;
      else if (r2 === runnerId) r2 = null;
      else if (r3 === runnerId) r3 = null;
      if (toBase === 3) r3 = runnerId;
      else if (toBase === 2) r2 = runnerId;
      continue;
    }

    if (etype === 'caught_stealing' || etype === 'baserunner_out') {
      const runnerId = p.runnerId as string | undefined;
      if (r1 === runnerId) r1 = null;
      else if (r2 === runnerId) r2 = null;
      else if (r3 === runnerId) r3 = null;
      continue;
    }

    if (etype === 'baserunner_advance') {
      const runnerId = p.runnerId as string | undefined;
      const toBase = p.toBase as number | undefined;
      if (!runnerId || !toBase) continue;
      if (r1 === runnerId) r1 = null;
      else if (r2 === runnerId) r2 = null;
      else if (r3 === runnerId) r3 = null;
      if (toBase === 3) r3 = runnerId;
      else if (toBase === 2) r2 = runnerId;
      else if (toBase === 1) r1 = runnerId;
      continue;
    }

    if (etype === 'score') {
      const scoringPlayerId = p.scoringPlayerId as string | undefined;
      if (!scoringPlayerId) continue;
      scoreRunner(scoringPlayerId);
      if (r3 === scoringPlayerId) r3 = null;
      else if (r2 === scoringPlayerId) r2 = null;
      else if (r1 === scoringPlayerId) r1 = null;
      continue;
    }
  }

  return stats;
}
