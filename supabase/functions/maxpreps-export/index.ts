/**
 * maxpreps-export edge function
 *
 * Request body (Tier 5, backwards compatible with the original single-game TXT):
 *   { gameId: string }                             → TXT, byte-identical to pre-Tier-5 output (default)
 *   { gameId: string, format: 'txt' }              → same as above
 *   { gameId: string, format: 'xml' }              → MaxPreps stats XML for one game
 *   { seasonId: string, format: 'xml' }            → MaxPreps stats XML for every completed game in the season
 *   { seasonId: string, format: 'txt' }            → 400 (batch TXT intentionally unsupported — use XML)
 *
 * Response: text/plain (TXT) or application/xml (XML) file download.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { aggregateStats, applyCorrections, type PlayerStats, type RawEvent } from './stats.ts';
import { buildMaxPrepsXml, type AggregatedGame, type AggregatedPlayer } from './xml.ts';

type SupabaseClient = ReturnType<typeof createClient>;

interface GameRow {
  id: string;
  team_id: string;
  // Nullable in DB (TBD slots) — callers must guard before using.
  opponent_name: string | null;
  scheduled_at: string;
  home_score: number;
  away_score: number;
  seasons: { name: string; teams: { name: string; organization: string } } | null;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function fetchGame(supabase: SupabaseClient, gameId: string): Promise<GameRow | null> {
  const { data, error } = await supabase
    .from('games')
    .select(`
      id, team_id, opponent_name, scheduled_at, home_score, away_score,
      seasons (
        name,
        teams (name, organization, state_code)
      )
    `)
    .eq('id', gameId)
    .single();

  if (error || !data) return null;
  return data as unknown as GameRow;
}

async function fetchCompletedGamesForSeason(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<GameRow[]> {
  const { data, error } = await supabase
    .from('games')
    .select(`
      id, team_id, opponent_name, scheduled_at, home_score, away_score,
      seasons (
        name,
        teams (name, organization, state_code)
      )
    `)
    .eq('season_id', seasonId)
    .eq('status', 'completed')
    // MaxPreps requires a real opponent — TBD slots that somehow ended up
    // completed (shouldn't happen, but be defensive) are excluded.
    .not('opponent_name', 'is', null)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as GameRow[];
}

async function aggregateOneGame(
  supabase: SupabaseClient,
  game: GameRow,
): Promise<{ playerStats: Map<string, PlayerStats>; players: Map<string, { id: string; first_name: string; last_name: string; jersey_number: number | null }> }> {
  const { data: events } = await supabase
    .from('game_events')
    .select('id, sequence_number, event_type, payload, inning, is_top_of_inning')
    .eq('game_id', game.id)
    .order('sequence_number');

  const correctedEvents = applyCorrections((events ?? []) as unknown as RawEvent[]);
  const playerStats = aggregateStats(correctedEvents);

  const playerIds = [...playerStats.keys()];
  const { data: players } = playerIds.length === 0
    ? { data: [] as Array<{ id: string; first_name: string; last_name: string; jersey_number: number | null }> }
    : await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number')
        .in('id', playerIds);

  const playerMap = new Map(
    (players ?? []).map((p) => [p.id as string, p as { id: string; first_name: string; last_name: string; jersey_number: number | null }]),
  );
  return { playerStats, players: playerMap };
}

function buildTxtForSingleGame(
  game: GameRow,
  playerStats: Map<string, PlayerStats>,
  playerMap: Map<string, { first_name: string; last_name: string; jersey_number: number | null }>,
): string {
  const gameDate = new Date(game.scheduled_at).toLocaleDateString('en-US');
  const teamName = game.seasons?.teams?.name ?? 'Team';
  // Caller already 400'd on null opponent; the fallback only satisfies TS.
  const opponent = game.opponent_name ?? '';
  const homeScore = game.home_score;
  const awayScore = game.away_score;

  const lines: string[] = [
    '# MaxPreps Game Score Export',
    `# Generated: ${new Date().toISOString()}`,
    `# Game: ${teamName} vs ${opponent} — ${gameDate}`,
    `# Final Score: ${homeScore}-${awayScore}`,
    '',
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

  return lines.join('\n');
}

function buildAggregatedGame(
  game: GameRow,
  playerStats: Map<string, PlayerStats>,
  playerMap: Map<string, { id: string; first_name: string; last_name: string; jersey_number: number | null }>,
): AggregatedGame {
  const teamName = game.seasons?.teams?.name ?? 'Team';
  const players: AggregatedPlayer[] = [];
  for (const [playerId, stats] of playerStats.entries()) {
    const p = playerMap.get(playerId);
    if (!p) continue;
    players.push({
      playerId,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
      stats,
    });
  }
  return {
    gameId: game.id,
    gameDate: game.scheduled_at,
    teamName,
    opponentName: game.opponent_name ?? '',
    homeScore: game.home_score,
    awayScore: game.away_score,
    players,
  };
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { gameId?: string; seasonId?: string; format?: 'txt' | 'xml' };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const format = body.format ?? 'txt';
  if (format !== 'txt' && format !== 'xml') {
    return jsonError(400, `Invalid format "${format}" — expected "txt" or "xml"`);
  }

  if (body.seasonId && format === 'txt') {
    return jsonError(400, 'Batch export requires format:"xml"');
  }
  if (!body.gameId && !body.seasonId) {
    return jsonError(400, 'gameId or seasonId is required');
  }

  // ─── Single-game path ────────────────────────────────────────────────────
  if (body.gameId) {
    const game = await fetchGame(supabase, body.gameId);
    if (!game) return jsonError(404, 'Game not found');
    if (!game.opponent_name) {
      return jsonError(400, 'Cannot export a game with a TBD opponent — set the opponent first.');
    }

    const { playerStats, players } = await aggregateOneGame(supabase, game);

    if (format === 'txt') {
      const txt = buildTxtForSingleGame(game, playerStats, players);
      return new Response(txt, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="game-${body.gameId}-maxpreps.txt"`,
        },
      });
    }

    // format === 'xml'
    const aggregated = buildAggregatedGame(game, playerStats, players);
    const xml = buildMaxPrepsXml([aggregated]);
    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="game-${body.gameId}-maxpreps.xml"`,
      },
    });
  }

  // ─── Season-batch path (XML only) ────────────────────────────────────────
  const games = await fetchCompletedGamesForSeason(supabase, body.seasonId!);
  if (games.length === 0) {
    return jsonError(404, 'No completed games found for season');
  }

  const aggregatedGames: AggregatedGame[] = [];
  for (const game of games) {
    const { playerStats, players } = await aggregateOneGame(supabase, game);
    aggregatedGames.push(buildAggregatedGame(game, playerStats, players));
  }

  const xml = buildMaxPrepsXml(aggregatedGames);
  return new Response(xml, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="season-${body.seasonId}-maxpreps.xml"`,
    },
  });
});
