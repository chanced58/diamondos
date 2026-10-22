import type { SupabaseClient } from '@supabase/supabase-js';
import { getLatestScoutingCard, insertScoutingCard } from '@baseball/database';
import {
  computeOpponentBatting,
  filterResetAndReverted,
  scoutingCardInputSchema,
  type PersistedScoutingCard,
  type ScoutingCardResponse,
  type ScoutingHitterStats,
  type ScoutingPitcherStats,
} from '@baseball/shared';
import { generateScoutingCard as generateAiScoutingCard } from '@/lib/ai/scouting-card';
import { computeOpponentPitcherStats } from '@/lib/ai/opponent-pitcher-stats';
import { logAiGeneration } from '@/lib/ai/log-generation';
import { AI_MODELS } from '@/lib/ai/client';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeOpponentTeam } from '../opponent-teams/opponent-teams';

/**
 * An opponent's AI scouting card (the web /games/opponents/[id]/card page):
 * the latest one, or a new one generated from our past games against them.
 * Coaches of the team that owns the opponent team.
 */

export async function loadScoutingCard(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<ScoutingCardResponse>> {
  const parsed = scoutingCardInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { opponentTeamId } = parsed.data;

  const auth = await authorizeOpponentTeam(db, actorUserId, opponentTeamId);
  if (!auth.ok) return auth;
  const { teamId, ...opponentTeam } = auth.data;

  try {
    const [{ count, error }, card] = await Promise.all([
      db.from('games').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('opponent_team_id', opponentTeamId),
      getLatestScoutingCard(db as never, opponentTeamId, teamId),
    ]);
    if (error) throw new Error(`games count failed: ${error.message}`);
    return serviceOk({ opponentTeam, priorGames: count ?? 0, card });
  } catch (err) {
    console.error(`[loadScoutingCard] opponentTeam=${opponentTeamId} actor=${actorUserId} failed:`, err);
    return serviceError('failed', 'Failed to load the scouting card.');
  }
}

export async function generateScoutingCard(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ card: PersistedScoutingCard }>> {
  const parsed = scoutingCardInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { opponentTeamId } = parsed.data;

  const auth = await authorizeOpponentTeam(db, actorUserId, opponentTeamId);
  if (!auth.ok) return auth;
  const { teamId, name, city } = auth.data;

  let context: ScoutingContext;
  try {
    context = await loadScoutingContext(db, teamId, opponentTeamId);
  } catch (err) {
    console.error(`[generateScoutingCard] opponentTeam=${opponentTeamId} actor=${actorUserId} context failed:`, err);
    return serviceError('failed', 'Failed to read past games against this opponent.');
  }
  if (context.gameSampleCount === 0) {
    return serviceError('conflict', 'No prior games recorded against this opponent. Play them first, then come back.');
  }

  const start = Date.now();
  try {
    const result = await generateAiScoutingCard({
      opponentName: name,
      opponentCity: city,
      gameSampleCount: context.gameSampleCount,
      hitterStats: context.hitterStats,
      pitcherStats: context.pitcherStats,
      ourPitchers: context.ourPitchers,
      derivedTendencies: context.derivedTendencies,
      coachNotes: null,
    });
    const card = await insertScoutingCard(db as never, {
      opponentTeamId,
      teamId,
      aiCard: result.card,
      hitterStats: context.hitterStats,
      pitcherStats: context.pitcherStats,
      gameSampleCount: context.gameSampleCount,
      model: result.model,
      generatedBy: actorUserId,
    });
    await logAiGeneration({
      feature: 'scouting_card',
      teamId,
      userId: actorUserId,
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - start,
      status: 'success',
    });
    return serviceOk({ card });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[generateScoutingCard] opponentTeam=${opponentTeamId} actor=${actorUserId} failed:`, err);
    await logAiGeneration({
      feature: 'scouting_card',
      teamId,
      userId: actorUserId,
      model: AI_MODELS.opus,
      latencyMs: Date.now() - start,
      status: 'error',
      errorMessage: message,
    });
    return serviceError('failed', 'Scouting card generation failed. Please try again.');
  }
}

interface ScoutingContext {
  hitterStats: ScoutingHitterStats[];
  pitcherStats: ScoutingPitcherStats[];
  gameSampleCount: number;
  ourPitchers: string[];
  derivedTendencies: string[];
}

const PAGE_SIZE = 1000;

/** What the card draws on: their hitters' and pitchers' lines from our games against them, and our pitchers. */
async function loadScoutingContext(db: SupabaseClient, teamId: string, opponentTeamId: string): Promise<ScoutingContext> {
  const [gamesResult, oppPlayersResult] = await Promise.all([
    db.from('games').select('id').eq('team_id', teamId).eq('opponent_team_id', opponentTeamId),
    db.from('opponent_players').select('id, first_name, last_name, primary_position, bats, throws').eq('opponent_team_id', opponentTeamId),
  ]);
  if (gamesResult.error) throw new Error(gamesResult.error.message);
  if (oppPlayersResult.error) throw new Error(oppPlayersResult.error.message);

  const gameIds = (gamesResult.data ?? []).map((g) => g.id as string);
  if (gameIds.length === 0) {
    return { hitterStats: [], pitcherStats: [], gameSampleCount: 0, ourPitchers: [], derivedTendencies: [] };
  }

  const meta = new Map<string, { displayName: string; position?: string; bats?: string }>();
  for (const p of oppPlayersResult.data ?? []) {
    meta.set(p.id as string, {
      displayName: `${p.first_name} ${p.last_name}`,
      position: (p.primary_position as string | null) ?? undefined,
      bats: (p.bats as string | null) ?? undefined,
    });
  }

  // Every event in page order, past PostgREST's row cap; voided, reverted and
  // reset plays are dropped before anything is counted.
  const rawEvents: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: page, error } = await db
      .from('game_events')
      .select('id, event_type, payload, game_id, sequence_number')
      .in('game_id', gameIds)
      .order('game_id')
      .order('sequence_number')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rawEvents.push(...(page ?? []));
    if ((page ?? []).length < PAGE_SIZE) break;
  }
  const events = filterResetAndReverted(rawEvents);

  const hitterStats: ScoutingHitterStats[] = computeOpponentBatting(
    events,
    new Map(Array.from(meta, ([id, m]) => [id, m.displayName])),
  ).map((r) => ({
    opponentPlayerId: r.playerId,
    displayName: r.playerName,
    position: meta.get(r.playerId)?.position,
    bats: meta.get(r.playerId)?.bats,
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
  }));

  const pitcherStats = computeOpponentPitcherStats(
    events.map((e) => ({ event_type: e.event_type as string, payload: (e.payload ?? {}) as Record<string, unknown> })),
    new Map(Array.from(meta, ([id, m]) => [id, { displayName: m.displayName }])),
  );

  // Our likely pitchers, by name, for the matchup notes: primary or secondary
  // pitchers, like the Bullpen Planner. Positions are `player_position` enum
  // values — 'P' isn't one, and filtering on it fails the whole query.
  const { data: ourPitcherRows, error: pitchersError } = await db
    .from('players')
    .select('first_name, last_name')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .or('primary_position.eq.pitcher,secondary_positions.cs.{pitcher}');
  if (pitchersError) throw new Error(pitchersError.message);

  return {
    hitterStats,
    pitcherStats,
    gameSampleCount: gameIds.length,
    ourPitchers: (ourPitcherRows ?? []).map((p) => `${p.first_name} ${p.last_name}`),
    derivedTendencies: [], // reserved for future integration with opponent-scouting-derive.ts
  };
}

function formatRate(x: number): string {
  if (!Number.isFinite(x)) return '.000';
  const rounded = x.toFixed(3);
  return rounded.startsWith('0') ? rounded.slice(1) : rounded;
}
