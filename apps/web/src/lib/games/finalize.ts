import type { SupabaseClient } from '@supabase/supabase-js';
import { applyPitchReverted, computeLineScore } from '@baseball/shared';
import { recomputeLeagueSnapshot } from '@/lib/league-snapshot/recompute';
import { runReconciliationForGame } from '@/lib/dual-scorekeeper/reconcile';
import { refreshLeagueGame } from '@/lib/league-games/refresh';

export const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

/**
 * Roles that may finalize a game the mobile app ended offline: coaches plus
 * scorekeepers, who record the game's events (RLS lets them insert
 * `game_events`, game_end included) and so must be able to complete it.
 */
export const FINALIZE_ROLES = [...COACH_ROLES, 'scorekeeper'];

/**
 * Authorize a user as a coach (or platform admin) for a game's team.
 * Used by the game server actions; the mobile finalize route uses
 * {@link getAuthorizedFinalizer}, which also admits scorekeepers.
 */
export async function getAuthorizedCoach(supabase: SupabaseClient, userId: string, gameId: string) {
  return authorizeGameRole(supabase, userId, gameId, COACH_ROLES, 'Only coaches can perform this action.');
}

/** Authorize a coach, scorekeeper (or platform admin) to finalize a game. */
export async function getAuthorizedFinalizer(supabase: SupabaseClient, userId: string, gameId: string) {
  return authorizeGameRole(
    supabase, userId, gameId, FINALIZE_ROLES, 'Only coaches and scorekeepers can finalize a game.',
  );
}

async function authorizeGameRole(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
  allowedRoles: readonly string[],
  deniedMessage: string,
) {
  const { data: game } = await supabase
    .from('games')
    .select('team_id, opponent_name, opponent_team_id, scheduled_at, time_zone, status, location_type, neutral_home_team, tournament_id, league_game_id, result_source')
    .eq('id', gameId)
    .single();
  // `code` lets callers branch on the failure kind (e.g. 404 vs 403) without
  // matching on the human-readable message text.
  if (!game) return { error: 'Game not found.', code: 'not_found' as const };

  // Check platform admin first (they have full access to every team)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.is_platform_admin) return { game };

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (!membership || !allowedRoles.includes(membership.role)) {
    return { error: deniedMessage, code: 'forbidden' as const };
  }

  return { game };
}

/** The game's effective event rows: post-reset, with corrections applied. */
async function fetchEffectiveEvents(
  supabase: SupabaseClient,
  gameId: string,
): Promise<Record<string, unknown>[]> {
  const { data: allEvents } = await supabase
    .from('game_events')
    .select('*')
    .eq('game_id', gameId)
    .order('sequence_number');

  const rows = (allEvents ?? []) as Record<string, unknown>[];
  const lastResetIdx = rows.map((e) => e.event_type).lastIndexOf('game_reset');
  const activeEvents = lastResetIdx === -1 ? rows : rows.slice(lastResetIdx + 1);
  return applyPitchReverted(activeEvents);
}

/**
 * Fetch game events and derive scores by replaying the event stream.
 * This is the single source of truth for final scores — ensures consistency
 * between the box score, game summary, and dashboard.
 */
export async function deriveScoresFromEvents(
  supabase: SupabaseClient,
  gameId: string,
): Promise<{ homeScore: number; awayScore: number }> {
  const effectiveEvents = await fetchEffectiveEvents(supabase, gameId);
  const lineScore = computeLineScore(effectiveEvents);
  return { homeScore: lineScore.homeRuns, awayScore: lineScore.awayRuns };
}

export interface FinalizeGameArgs {
  gameId: string;
  userId: string;
  /** Scores as the coach saw them when ending the game (event payload only —
   *  the games row is updated from the re-derived line score). */
  clientHomeScore: number;
  clientAwayScore: number;
  inning: number;
  isTopOfInning: boolean;
  deviceId: string;
}

/**
 * Finalize a game: ensure a game_end event exists, set games.status =
 * 'completed' with event-derived final scores, then run dual-scorekeeper
 * reconciliation and league snapshot recomputes (both best-effort). A league
 * game's row hands both to `refreshLeagueGame` instead.
 *
 * Idempotent by construction — the mobile sync engine may retry the finalize
 * call across cycles, and the coach may have already recorded a game_end
 * event offline (pushed before this runs):
 *   - the game_end insert is skipped when an active one already exists;
 *   - the games update writes the same derived values on every run.
 *
 * Callers must authorize first (getAuthorizedCoach); `supabase` is expected
 * to be a service-role client.
 */
export async function finalizeGame(
  supabase: SupabaseClient,
  args: FinalizeGameArgs,
): Promise<{ ok: true } | { error: string }> {
  const { gameId, userId } = args;
  const now = new Date().toISOString();

  const effectiveEvents = await fetchEffectiveEvents(supabase, gameId);
  const hasActiveGameEnd = effectiveEvents.some((e) => e.event_type === 'game_end');

  if (!hasActiveGameEnd) {
    // Next sequence comes from the RAW log (not the effective events) —
    // correction markers can hold higher sequence numbers than any effective
    // event, and unique(game_id, sequence_number) would reject a collision.
    const { data: lastEvent } = await supabase
      .from('game_events')
      .select('sequence_number')
      .eq('game_id', gameId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const maxSeq = lastEvent?.sequence_number ?? 0;
    const { error: insertErr } = await supabase.from('game_events').insert({
      id: crypto.randomUUID(),
      game_id: gameId,
      sequence_number: maxSeq + 1,
      event_type: 'game_end',
      inning: args.inning,
      is_top_of_inning: args.isTopOfInning,
      payload: { homeScore: args.clientHomeScore, awayScore: args.clientAwayScore },
      occurred_at: now,
      created_by: userId,
      device_id: args.deviceId,
    });
    if (insertErr) {
      // A 23505 here means a concurrent finalize won the sequence slot —
      // safe to continue; the games update below is idempotent.
      if (insertErr.code !== '23505') {
        return { error: `Failed to record game end: ${insertErr.message}` };
      }
    }
  }

  // Re-derive scores server-side from the event stream to ensure consistency
  // with the box score (computeLineScore is the single source of truth).
  const { homeScore, awayScore } = await deriveScoresFromEvents(supabase, gameId);

  // result_source is cleared: once this row has its own finished book, a
  // result an earlier league refresh wrote onto it no longer applies.
  const { error: updateErr } = await supabase
    .from('games')
    .update({
      status: 'completed',
      completed_at: now,
      updated_at: now,
      home_score: homeScore,
      away_score: awayScore,
      result_source: null,
    })
    .eq('id', gameId);
  if (updateErr) {
    return { error: `Failed to complete game: ${updateErr.message}` };
  }

  // The row is completed, but whether it is a league game decides what runs
  // next; a failed reload answers an error so the caller retries (finalize is
  // idempotent) instead of skipping the league refresh for good.
  const finalized = await loadFinalizedGame(supabase, gameId);
  if ('error' in finalized) return finalized;

  // A league game: the league refresh reconciles both books, notifies the
  // teams, writes the result onto the other team's row and rebuilds the
  // league snapshot (best-effort; it logs and never throws).
  if (finalized.league_game_id) {
    await refreshLeagueGame(supabase, finalized.league_game_id, userId);
    return { ok: true };
  }

  // Dual scorekeeper: if this game is paired with an opponent's parallel game,
  // (re)compute the reconciliation once both logs are done. Best-effort
  // (runReconciliationForGame catches internally).
  await runReconciliationForGame(supabase, gameId, userId);

  await recomputeTeamLeagues(supabase, gameId, finalized);

  return { ok: true };
}

interface FinalizedGame {
  team_id: string | null;
  season_id: string | null;
  league_game_id: string | null;
}

async function loadFinalizedGame(
  supabase: SupabaseClient,
  gameId: string,
): Promise<FinalizedGame | { error: string }> {
  const { data, error } = await supabase
    .from('games')
    .select('team_id, season_id, league_game_id')
    .eq('id', gameId)
    .maybeSingle();
  if (error || !data) {
    const reason = error?.message ?? 'row not found';
    console.error(`[finalizeGame] finalized game reload failed game=${gameId}: ${reason}`);
    return { error: 'The game was completed but its follow-up failed. Please try again.' };
  }
  return data as FinalizedGame;
}

/**
 * Refresh league home-page snapshots for the finalized game's league + season.
 * Non-fatal: the scheduled rebuild (cron) self-heals if this is skipped/errors.
 */
async function recomputeTeamLeagues(supabase: SupabaseClient, gameId: string, game: FinalizedGame): Promise<void> {
  try {
    if (!game.team_id || !game.season_id) return;
    const { data: s } = await supabase
      .from('seasons')
      .select('name')
      .eq('id', game.season_id)
      .maybeSingle();
    // A team may belong to more than one league; refresh each.
    const { data: memberships } = await supabase
      .from('league_members')
      .select('league_id')
      .eq('team_id', game.team_id)
      .eq('is_active', true);
    if (s?.name) {
      for (const m of memberships ?? []) {
        if (m.league_id) await recomputeLeagueSnapshot(supabase, m.league_id, s.name);
      }
    }
  } catch (err) {
    console.error(
      `[finalizeGame] snapshot recompute failed game=${gameId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
