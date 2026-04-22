'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  PersistedScoutingCard,
  ScoutingHitterStats,
  ScoutingPitcherStats,
} from '@baseball/shared';
import { computeOpponentBatting } from '@baseball/shared';
import {
  getLatestScoutingCard,
  insertScoutingCard,
} from '@baseball/database';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { generateScoutingCard } from '@/lib/ai/scouting-card';
import { computeOpponentPitcherStats } from '@/lib/ai/opponent-pitcher-stats';
import { logAiGeneration } from '@/lib/ai/log-generation';
import { AI_MODELS } from '@/lib/ai/client';

type SupabaseUntyped = SupabaseClient;

export async function generateScoutingCardAction(
  opponentTeamId: string,
): Promise<PersistedScoutingCard | string> {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const activeTeam = await getActiveTeam(authClient, user.id);
  if (!activeTeam) return 'No active team.';

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) return 'Only coaches can generate scouting cards.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: oppTeam, error: oppErr } = await db
    .from('opponent_teams')
    .select('id, name, city, team_id')
    .eq('id', opponentTeamId)
    .maybeSingle();
  if (oppErr) return `Failed to load opponent: ${oppErr.message}`;
  if (!oppTeam || oppTeam.team_id !== activeTeam.id) {
    return 'Opponent team not found for this team.';
  }

  const ctx = await loadScoutingContext(db, activeTeam.id, opponentTeamId);
  if (ctx.gameSampleCount === 0) {
    return 'No prior games recorded against this opponent. Play them first, then come back.';
  }

  const start = Date.now();
  try {
    const result = await generateScoutingCard({
      opponentName: oppTeam.name as string,
      opponentCity: (oppTeam.city as string | null) ?? null,
      gameSampleCount: ctx.gameSampleCount,
      hitterStats: ctx.hitterStats,
      pitcherStats: ctx.pitcherStats,
      ourPitchers: ctx.ourPitchers,
      derivedTendencies: ctx.derivedTendencies,
      coachNotes: null,
    });

    const persisted = await insertScoutingCard(db as never, {
      opponentTeamId,
      teamId: activeTeam.id,
      aiCard: result.card,
      hitterStats: ctx.hitterStats,
      pitcherStats: ctx.pitcherStats,
      gameSampleCount: ctx.gameSampleCount,
      model: result.model,
      generatedBy: user.id,
    });

    await logAiGeneration({
      feature: 'scouting_card',
      teamId: activeTeam.id,
      userId: user.id,
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - start,
      status: 'success',
    });

    return persisted;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await logAiGeneration({
      feature: 'scouting_card',
      teamId: activeTeam.id,
      userId: user.id,
      model: AI_MODELS.opus,
      latencyMs: Date.now() - start,
      status: 'error',
      errorMessage: msg,
    });
    return `Scouting card generation failed: ${msg}`;
  }
}

export async function loadLatestScoutingCardAction(
  opponentTeamId: string,
): Promise<PersistedScoutingCard | null | string> {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    return await getLatestScoutingCard(db as never, opponentTeamId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return `Failed to load scouting card: ${msg}`;
  }
}

interface ScoutingContext {
  hitterStats: ScoutingHitterStats[];
  pitcherStats: ScoutingPitcherStats[];
  gameSampleCount: number;
  ourPitchers: string[];
  derivedTendencies: string[];
}

async function loadScoutingContext(
  db: SupabaseUntyped,
  teamId: string,
  opponentTeamId: string,
): Promise<ScoutingContext> {
  const [gamesResult, oppPlayersResult] = await Promise.all([
    db
      .from('games')
      .select('id')
      .eq('team_id', teamId)
      .eq('opponent_team_id', opponentTeamId),
    db
      .from('opponent_players')
      .select('id, first_name, last_name, primary_position, bats, throws')
      .eq('opponent_team_id', opponentTeamId),
  ]);
  if (gamesResult.error) throw new Error(gamesResult.error.message);
  if (oppPlayersResult.error) throw new Error(oppPlayersResult.error.message);

  const gameIds = ((gamesResult.data ?? []) as Array<{ id: string }>).map(
    (g) => g.id,
  );

  if (gameIds.length === 0) {
    return {
      hitterStats: [],
      pitcherStats: [],
      gameSampleCount: 0,
      ourPitchers: [],
      derivedTendencies: [],
    };
  }

  const oppPlayers = (oppPlayersResult.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    primary_position: string | null;
    bats: string | null;
    throws: string | null;
  }>;
  const oppPlayerNameMap = new Map<string, string>();
  const oppPlayerMetaMap = new Map<
    string,
    { displayName: string; position?: string; bats?: string }
  >();
  for (const p of oppPlayers) {
    const display = `${p.first_name} ${p.last_name}`;
    oppPlayerNameMap.set(p.id, display);
    oppPlayerMetaMap.set(p.id, {
      displayName: display,
      position: p.primary_position ?? undefined,
      bats: p.bats ?? undefined,
    });
  }

  const { data: events, error: eventsErr } = await db
    .from('game_events')
    .select('*')
    .in('game_id', gameIds);
  if (eventsErr) throw new Error(eventsErr.message);

  const rawEvents = (events ?? []) as Array<Record<string, unknown>>;

  // Hitter stats
  const battingRows = computeOpponentBatting(rawEvents, oppPlayerNameMap);
  const hitterStats: ScoutingHitterStats[] = battingRows.map((r) => {
    const meta = oppPlayerMetaMap.get(r.playerId);
    return {
      opponentPlayerId: r.playerId,
      displayName: r.playerName,
      position: meta?.position,
      bats: meta?.bats,
      pa: r.pa,
      ab: r.ab,
      h: r.h,
      hr: r.hr,
      k: r.k,
      bb: r.bb,
      avg: formatRate(r.avg),
      obp: formatRate(r.obp),
      slg: formatRate(r.slg),
      ops: formatRate(r.ops),
    };
  });

  // Pitcher stats — computed from opponent's pitchers in our plate appearances
  const pitcherStats = computeOpponentPitcherStats(
    rawEvents.map((e) => ({
      event_type: e.event_type as string,
      payload: (e.payload ?? {}) as Record<string, unknown>,
    })),
    new Map(
      Array.from(oppPlayerMetaMap.entries()).map(([id, meta]) => [
        id,
        { displayName: meta.displayName },
      ]),
    ),
  );

  // Our probable pitchers — pull our team's active pitchers (positions include 'P')
  const { data: ourPitcherRows, error: pitchersErr } = await db
    .from('players')
    .select('first_name, last_name, primary_position')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .or('primary_position.eq.P,primary_position.eq.SP,primary_position.eq.RP');
  if (pitchersErr) throw new Error(pitchersErr.message);
  const ourPitchers = ((ourPitcherRows ?? []) as Array<{
    first_name: string;
    last_name: string;
  }>).map((p) => `${p.first_name} ${p.last_name}`);

  return {
    hitterStats,
    pitcherStats,
    gameSampleCount: gameIds.length,
    ourPitchers,
    derivedTendencies: [], // reserved for future integration with opponent-scouting-derive.ts
  };
}

function formatRate(x: number): string {
  if (!Number.isFinite(x) || Number.isNaN(x)) return '.000';
  const rounded = x.toFixed(3);
  return rounded.startsWith('0') ? rounded.slice(1) : rounded;
}
