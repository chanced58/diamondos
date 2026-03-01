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

  function get(id: string): PlayerStats {
    if (!stats.has(id)) {
      stats.set(id, { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 });
    }
    return stats.get(id)!;
  }

  for (const event of events) {
    const p = event.payload as Record<string, unknown>;
    const batterId = p.batterId as string;
    if (!batterId) continue;

    switch (event.event_type) {
      case 'hit': {
        const s = get(batterId);
        s.ab++;
        s.h++;
        s.rbi += (p.rbis as number) ?? 0;
        if (p.hitType === 'double') s.doubles++;
        if (p.hitType === 'triple') s.triples++;
        if (p.hitType === 'home_run') { s.hr++; s.r++; }
        break;
      }
      case 'out':
      case 'strikeout':
      case 'double_play':
      case 'sacrifice_fly': {
        const s = get(batterId);
        if (event.event_type !== 'sacrifice_fly') s.ab++;
        if (event.event_type === 'strikeout') s.so++;
        s.rbi += (p.rbis as number) ?? 0;
        break;
      }
      case 'walk': {
        get(batterId).bb++;
        break;
      }
      case 'score': {
        const scoringPlayerId = p.scoringPlayerId as string;
        if (scoringPlayerId) get(scoringPlayerId).r++;
        break;
      }
    }
  }

  return stats;
}
