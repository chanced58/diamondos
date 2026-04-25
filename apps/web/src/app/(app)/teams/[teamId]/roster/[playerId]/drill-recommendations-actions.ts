'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  deriveBattingStats,
  derivePitchingStats,
  filterResetAndReverted,
  formatBattingRate,
  type AiDrillRecommendations,
  type PracticeDrill,
  type PracticeDrillVisibility,
} from '@baseball/shared';
import { RELEVANT_EVENT_TYPES } from '../../../../compliance/constants';
import { buildLineupsByGameId } from '@/lib/stats/lineups';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import {
  rankDrillsForPlayer,
  type PlayerFocusSignal,
} from '@/lib/ai/drill-ranker';
import { logAiGeneration } from '@/lib/ai/log-generation';
import { AI_MODELS } from '@/lib/ai/client';

type SupabaseUntyped = SupabaseClient;

export interface RankDrillsSuccess {
  recommendations: AiDrillRecommendations;
  drillsById: Record<string, { name: string; description?: string; durationMinutes?: number }>;
  unknownDrillIds: string[];
}

export async function rankDrillsForPlayerAction(
  teamId: string,
  playerId: string,
): Promise<RankDrillsSuccess | string> {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const { isCoach } = await getUserAccess(teamId, user.id);
  if (!isCoach) return 'Only coaches can rank drills for players.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: player, error: playerErr } = await db
    .from('players')
    .select('id, first_name, last_name, primary_position, bats, throws')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (playerErr) return `Failed to load player: ${playerErr.message}`;
  if (!player) return 'Player not found on this team.';

  const start = Date.now();
  try {
    const ctx = await loadPlayerContext(db, teamId, player);
    const drills = await loadFilteredDrills(
      db,
      teamId,
      playerId,
      player.primary_position as string | null,
    );
    const result = await rankDrillsForPlayer({
      player: {
        firstName: player.first_name as string,
        lastName: player.last_name as string,
        primaryPosition: (player.primary_position as string | null) ?? null,
        bats: (player.bats as string | null) ?? null,
        throws: (player.throws as string | null) ?? null,
      },
      focusSignals: ctx.focusSignals,
      recentBattingLine: ctx.recentBattingLine,
      recentPitchingLine: ctx.recentPitchingLine,
      coachNote: null,
      drills,
    });

    const drillById = new Map(drills.map((d) => [d.id, d]));
    const unknownDrillIds: string[] = [];
    for (const rec of result.recommendations.rankedDrills) {
      if (!drillById.has(rec.drillId)) unknownDrillIds.push(rec.drillId);
    }

    // Strip any rec whose drillId we couldn't validate.
    const sanitized: AiDrillRecommendations = {
      summary: result.recommendations.summary,
      rankedDrills: result.recommendations.rankedDrills.filter((r) =>
        drillById.has(r.drillId),
      ),
    };

    const drillsById: RankDrillsSuccess['drillsById'] = {};
    for (const r of sanitized.rankedDrills) {
      const d = drillById.get(r.drillId)!;
      drillsById[r.drillId] = {
        name: d.name,
        description: d.description,
        durationMinutes: d.defaultDurationMinutes,
      };
    }

    await logAiGeneration({
      feature: 'drill_recommendation',
      teamId,
      userId: user.id,
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - start,
      status: 'success',
    });

    return {
      recommendations: sanitized,
      drillsById,
      unknownDrillIds,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await logAiGeneration({
      feature: 'drill_recommendation',
      teamId,
      userId: user.id,
      model: AI_MODELS.sonnet,
      latencyMs: Date.now() - start,
      status: 'error',
      errorMessage: msg,
    });
    return `Drill ranking failed: ${msg}`;
  }
}

interface PlayerContext {
  focusSignals: PlayerFocusSignal[];
  recentBattingLine: string | null;
  recentPitchingLine: string | null;
}

async function loadPlayerContext(
  db: SupabaseUntyped,
  teamId: string,
  player: { id: string; first_name: string; last_name: string },
): Promise<PlayerContext> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [repsResult, drillsResult, seasonResult] = await Promise.all([
    db
      .from('practice_reps')
      .select('drill_id, outcome, outcome_category, coach_tag, recorded_at')
      .eq('player_id', player.id)
      .gt('recorded_at', thirtyDaysAgo)
      .order('recorded_at', { ascending: false })
      .limit(200),
    db.from('practice_drills').select('id, name'),
    db
      .from('seasons')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  if (repsResult.error) throw new Error(repsResult.error.message);
  if (drillsResult.error) throw new Error(drillsResult.error.message);

  const drillNameById = new Map<string, string>();
  for (const d of (drillsResult.data ?? []) as Array<{ id: string; name: string }>) {
    drillNameById.set(d.id, d.name);
  }

  const reps = (repsResult.data ?? []) as Array<{
    drill_id: string | null;
    outcome: string;
    outcome_category: 'positive' | 'neutral' | 'negative';
    coach_tag: 'hot' | 'cold' | 'improved' | 'form_break' | null;
  }>;

  // Build focus signals from coach tags and outcome distribution.
  const taggedCounts = new Map<string, number>();
  let totalReps = 0;
  let negativeReps = 0;
  for (const r of reps) {
    totalReps += 1;
    if (r.outcome_category === 'negative') negativeReps += 1;
    if (r.coach_tag) {
      taggedCounts.set(r.coach_tag, (taggedCounts.get(r.coach_tag) ?? 0) + 1);
    }
  }

  const focusSignals: PlayerFocusSignal[] = [];
  for (const [tag, count] of taggedCounts.entries()) {
    if (tag === 'form_break' || tag === 'cold') {
      focusSignals.push({
        source: 'rep_tag',
        label: tag === 'form_break' ? 'Mechanical form breaks' : 'Cold streak',
        detail: `${count} flagged reps in the last 30 days`,
      });
    }
  }
  if (totalReps > 10 && negativeReps / totalReps > 0.5) {
    focusSignals.push({
      source: 'stat_gap',
      label: 'Low rep success rate',
      detail: `${negativeReps} of ${totalReps} reps in the last 30 days were negative-outcome`,
    });
  }

  // Season stats for the baseline line.
  let recentBattingLine: string | null = null;
  let recentPitchingLine: string | null = null;
  const seasonId = seasonResult.data?.id as string | undefined;

  // Falls back to "all games" when no active season exists so drill
  // signals stay aligned with what the player profile page displays.
  {
    let gamesQuery = db
      .from('games')
      .select('id, location_type, neutral_home_team')
      .eq('team_id', teamId)
      .in('status', ['completed', 'in_progress']);
    if (seasonId) gamesQuery = gamesQuery.eq('season_id', seasonId);
    const { data: games } = await gamesQuery;
    const gameIds = ((games ?? []) as Array<{ id: string; location_type: string; neutral_home_team: string | null }>).map((g) => g.id);
    if (gameIds.length > 0) {
      const { data: events } = await db
        .from('game_events')
        .select('*')
        .in('game_id', gameIds)
        .in('event_type', RELEVANT_EVENT_TYPES as unknown as string[])
        .order('game_id')
        .order('sequence_number');

      if (events && events.length > 0) {
        // Strip reverted/reset events so undone pitches don't skew recent
        // batting/pitching focus signals.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filteredEvents: any[] = filterResetAndReverted(events) as any[];

        // Build per-game lineup context so deriveBattingStats can recover
        // stub batter IDs during our team's half-inning. Best-effort: a DB
        // error logs and yields an empty Map rather than aborting the
        // recommendation flow.
        const lineupsByGameId = await buildLineupsByGameId(
          db,
          ((games ?? []) as Array<{ id: string; location_type: string; neutral_home_team: string | null }>).map((g) => ({
            id: g.id,
            location_type: g.location_type,
            neutral_home_team: g.neutral_home_team,
          })),
        );

        const playerEntry = [
          {
            id: player.id,
            firstName: player.first_name,
            lastName: player.last_name,
          },
        ];

        const battingMap = deriveBattingStats(filteredEvents, playerEntry, lineupsByGameId);
        const bs = battingMap.get(player.id);
        if (bs && bs.plateAppearances > 0) {
          recentBattingLine = `${formatBattingRate(bs.avg)}/${formatBattingRate(bs.obp)}/${formatBattingRate(bs.slg)} · PA ${bs.plateAppearances} · K% ${(bs.kPct * 100).toFixed(0)}% · BB% ${(bs.bbPct * 100).toFixed(0)}%`;
          if (bs.kPct > 0.3) {
            focusSignals.push({
              source: 'stat_gap',
              label: 'High strikeout rate',
              detail: `${(bs.kPct * 100).toFixed(0)}% K rate this season`,
            });
          }
          if (bs.bbPct < 0.05 && bs.plateAppearances >= 20) {
            focusSignals.push({
              source: 'stat_gap',
              label: 'Low walk rate — over-aggressive',
              detail: `${(bs.bbPct * 100).toFixed(0)}% BB rate across ${bs.plateAppearances} PA`,
            });
          }
        }

        const pitchingMap = derivePitchingStats(filteredEvents, playerEntry);
        const ps = pitchingMap.get(player.id);
        if (ps && ps.totalPAs > 0) {
          recentPitchingLine = `ERA ${isFinite(ps.era) ? ps.era.toFixed(2) : '---'} · WHIP ${isFinite(ps.whip) ? ps.whip.toFixed(2) : '---'} · K ${ps.strikeouts} · BB ${ps.walksAllowed} · STR% ${(ps.strikePercentage * 100).toFixed(0)}%`;
          if (ps.firstPitchStrikePercentage < 0.55 && ps.totalPAs >= 20) {
            focusSignals.push({
              source: 'stat_gap',
              label: 'Low first-pitch strike rate',
              detail: `${(ps.firstPitchStrikePercentage * 100).toFixed(0)}% FPS`,
            });
          }
        }
      }
    }
  }

  return { focusSignals, recentBattingLine, recentPitchingLine };
}

async function loadFilteredDrills(
  db: SupabaseUntyped,
  teamId: string,
  playerId: string,
  playerPosition: string | null,
): Promise<PracticeDrill[]> {
  const [drillsResult, injuriesResult] = await Promise.all([
    db
      .from('practice_drills')
      .select('*')
      .or(`team_id.is.null,team_id.eq.${teamId}`),
    // Tier 8 F2: active injury flags (window includes today).
    db
      .from('player_injury_flags')
      .select('injury_slug, effective_from, effective_to')
      .eq('player_id', playerId),
  ]);
  const { data, error } = drillsResult;
  if (error) throw new Error(`Failed to load drills: ${error.message}`);
  // Fail closed: a read error on injury flags must not silently skip the
  // contraindication filter and recommend an unsafe drill.
  if (injuriesResult.error) {
    throw new Error(`Failed to load injury flags: ${injuriesResult.error.message}`);
  }

  const all = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    teamId: (r.team_id as string | null) ?? null,
    visibility: r.visibility as PracticeDrillVisibility,
    name: r.name as string,
    description: (r.description as string | null) ?? undefined,
    defaultDurationMinutes:
      (r.default_duration_minutes as number | null) ?? undefined,
    skillCategories:
      (r.skill_categories as PracticeDrill['skillCategories']) ?? [],
    positions: (r.positions as string[]) ?? [],
    ageLevels: (r.age_levels as PracticeDrill['ageLevels']) ?? [],
    equipment: (r.equipment as PracticeDrill['equipment']) ?? [],
    fieldSpaces: (r.field_spaces as PracticeDrill['fieldSpaces']) ?? [],
    minPlayers: (r.min_players as number | null) ?? undefined,
    maxPlayers: (r.max_players as number | null) ?? undefined,
    coachingPoints: (r.coaching_points as string | null) ?? undefined,
    tags: (r.tags as string[]) ?? [],
    diagramUrl: (r.diagram_url as string | null) ?? undefined,
    videoUrl: (r.video_url as string | null) ?? undefined,
    source: (r.source as string | null) ?? undefined,
    createdBy: (r.created_by as string | null) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));

  // Tier 8 F2: pull drill contraindications for the player's active injuries.
  // "Active" = window includes today (start <= today, no end or end >= today).
  const todayIso = new Date().toISOString().slice(0, 10);
  const activeInjurySlugs = ((injuriesResult.data ?? []) as Array<{
    injury_slug: string;
    effective_from: string;
    effective_to: string | null;
  }>)
    .filter(
      (f) =>
        f.effective_from <= todayIso &&
        (!f.effective_to || f.effective_to >= todayIso),
    )
    .map((f) => f.injury_slug);

  const excludedDrillIds = new Set<string>();
  if (activeInjurySlugs.length > 0) {
    const { data: contra, error: contraError } = await db
      .from('drill_injury_contraindications')
      .select('drill_id, severity, team_id')
      .in('injury_slug', activeInjurySlugs)
      .or(`team_id.is.null,team_id.eq.${teamId}`);
    if (contraError) {
      throw new Error(`Failed to load drill contraindications: ${contraError.message}`);
    }
    for (const row of (contra ?? []) as Array<{
      drill_id: string;
      severity: 'hard' | 'caution';
    }>) {
      // Both severities exclude from the default AI-recommended flow; hard is
      // unconditional, caution could be overridden via a separate manual path.
      excludedDrillIds.add(row.drill_id);
    }
  }

  return all.filter((d) => {
    if (excludedDrillIds.has(d.id)) return false;
    if (d.positions.length === 0) return true;
    if (!playerPosition) return true;
    return d.positions.includes(playerPosition);
  });
}
