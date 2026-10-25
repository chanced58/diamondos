import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createPrepPracticeInputSchema,
  deriveOpponentTendencies,
  detectWeaknesses,
  generatePrepPractice,
  prepPreviewInputSchema,
  type DerivedScoutingTag,
  type EventType,
  type GameEvent,
  type HydratedWeaknessSignal,
  type OpponentPlayer,
  type PracticeDrill,
  type PracticeDrillDeficitPriority,
  type PracticeDrillDeficitTag,
  type PrepPreviewResponse,
  type WeaknessSignal,
} from '@baseball/shared';
import { createPrepPractice, getNextGameForTeam } from '@baseball/database';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { failed } from './practice-lookup';
import { mapDrillRow } from './team-drills';

/**
 * "Prep for next game" (the web /practices/prep/new page), shared with the
 * mobile routes: a practice plan aimed at the next game, built from the
 * weaknesses in a recent completed game, the opponent's tendencies and the
 * team's drills tagged with deficits. Coaches only (`resolveGameViewer`).
 */

type RawEvent = {
  id: string;
  game_id: string;
  sequence_number: number;
  event_type: string;
  inning: number;
  is_top_of_inning: boolean;
  payload: Record<string, unknown>;
  occurred_at: string;
  created_by: string;
  device_id: string;
};

/** The suggested plan for the team's next game; `nextGame` null when it has none with a named opponent. */
export async function loadPrepPreview(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PrepPreviewResponse>> {
  const parsed = prepPreviewInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, durationMinutes, sourceGameId } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer?.isCoach) return serviceError('forbidden', 'Only coaches can generate prep practices.');

  try {
    const nextGame = await getNextGameForTeam(db as never, teamId);
    if (!nextGame) {
      return serviceOk({
        nextGame: null,
        durationMinutes,
        focusSummary: '',
        hasGaps: false,
        blocks: [],
        drillsById: {},
        weaknessLabels: [],
        tendencyLabels: [],
      });
    }

    const [weaknesses, tendencies, drillsWithTags] = await Promise.all([
      loadRecentWeaknesses(db, teamId, sourceGameId),
      loadOpponentTendencies(db, teamId, nextGame.opponentTeamId),
      loadDrillsAndTags(db, teamId),
    ]);
    const generation = generatePrepPractice({
      nextGame,
      // getNextGameForTeam leaves out games without a named opponent.
      opponentName: nextGame.opponentName ?? '',
      tendencies,
      weaknesses,
      drills: drillsWithTags.drills,
      drillDeficitTags: drillsWithTags.tagsByDrill,
      durationMinutes,
    });

    return serviceOk({
      nextGame: {
        id: nextGame.id,
        opponentName: nextGame.opponentName ?? '',
        scheduledAt: nextGame.scheduledAt,
        timeZone: nextGame.timeZone ?? null,
      },
      durationMinutes,
      focusSummary: generation.focusSummary,
      hasGaps: generation.hasGaps,
      blocks: generation.blocks.map((b) => ({ ...b, drillId: b.drillId ?? undefined })),
      drillsById: Object.fromEntries(drillsWithTags.drills.map((d) => [d.id, d.name])),
      weaknessLabels: weaknesses.map((w) => w.label),
      tendencyLabels: tendencies.map((t) => t.tagValue),
    });
  } catch (error) {
    return failed('loadPrepPreview', teamId, actorUserId, error);
  }
}

/**
 * Saves a previewed prep plan as a practice linked to the game. The game must
 * be the team's, and drills the team can't see are dropped from the blocks.
 */
export async function createPrepPracticeFromPlan(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = createPrepPracticeInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, input.teamId);
  if (!viewer?.isCoach) return serviceError('forbidden', 'Only coaches can create prep practices.');

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id')
    .eq('id', input.linkedGameId)
    .eq('team_id', input.teamId)
    .maybeSingle();
  if (gameError) return failed('createPrepPracticeFromPlan', input.teamId, actorUserId, gameError);
  if (!game) return serviceError('not_found', 'Game not found.');

  try {
    const drillIds = [...new Set(input.blocks.map((b) => b.drillId).filter((id): id is string => Boolean(id)))];
    const visible = new Set<string>();
    if (drillIds.length > 0) {
      const { data, error } = await db
        .from('practice_drills')
        .select('id')
        .in('id', drillIds)
        .or(`team_id.is.null,team_id.eq.${input.teamId}`);
      if (error) throw error;
      for (const row of data ?? []) visible.add(row.id as string);
    }
    const created = await createPrepPractice(db as never, {
      teamId: input.teamId,
      linkedGameId: input.linkedGameId,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      prepFocusSummary: input.prepFocusSummary,
      blocks: input.blocks.map((b) => ({ ...b, drillId: b.drillId && visible.has(b.drillId) ? b.drillId : undefined })),
      createdBy: actorUserId,
    });
    return serviceOk({ practiceId: created.practiceId });
  } catch (error) {
    return failed('createPrepPracticeFromPlan', input.teamId, actorUserId, error);
  }
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

/**
 * Weaknesses from one completed game: the one the coach came from (if it is
 * the team's), else the most recent in the last 21 days.
 */
async function loadRecentWeaknesses(
  db: SupabaseClient,
  teamId: string,
  sourceGameId: string | null,
): Promise<HydratedWeaknessSignal[]> {
  let sourceGame: { id: string } | null = null;
  if (sourceGameId) {
    const { data, error } = await db
      .from('games')
      .select('id')
      .eq('id', sourceGameId)
      .eq('team_id', teamId)
      .eq('status', 'completed')
      .maybeSingle();
    if (error) throw new Error(`Failed to load source game: ${error.message}`);
    sourceGame = data ? { id: data.id as string } : null;
  }
  if (!sourceGame) {
    const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await db
      .from('games')
      .select('id, completed_at')
      .eq('team_id', teamId)
      .eq('status', 'completed')
      .gt('completed_at', twentyOneDaysAgo)
      .order('completed_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`Failed to load recent games: ${error.message}`);
    sourceGame = ((data ?? []) as Array<{ id: string }>)[0] ?? null;
  }
  if (!sourceGame) return [];

  const [eventsResult, playersResult, mapResult] = await Promise.all([
    db.from('game_events').select('*').eq('game_id', sourceGame.id).order('sequence_number'),
    db.from('players').select('id').eq('team_id', teamId),
    db.from('weakness_deficit_map').select('weakness_code, deficit_slug'),
  ]);
  if (eventsResult.error) throw new Error(`Failed to load game events: ${eventsResult.error.message}`);
  if (playersResult.error) throw new Error(`Failed to load players: ${playersResult.error.message}`);
  if (mapResult.error) throw new Error(`Failed to load weakness map: ${mapResult.error.message}`);

  const ourPlayerIds = new Set(((playersResult.data ?? []) as Array<{ id: string }>).map((p) => p.id));
  const signals: WeaknessSignal[] = detectWeaknesses(((eventsResult.data ?? []) as RawEvent[]).map(mapEvent), { ourPlayerIds });

  // Hydrate deficit slugs to ids.
  const slugsByCode = groupSlugs((mapResult.data ?? []) as Array<{ weakness_code: string; deficit_slug: string }>);
  const needed = new Set<string>();
  for (const s of signals) for (const slug of slugsByCode.get(s.code) ?? []) needed.add(slug);
  if (needed.size === 0) return signals.map((s) => ({ ...s, suggestedDeficitIds: [] }));

  const { data: deficitRows, error: deficitErr } = await db
    .from('practice_deficits')
    .select('id, slug')
    .eq('visibility', 'system')
    .in('slug', Array.from(needed));
  if (deficitErr) throw new Error(`Failed to hydrate deficits: ${deficitErr.message}`);
  const idBySlug = new Map(((deficitRows ?? []) as Array<{ id: string; slug: string }>).map((r) => [r.slug, r.id]));

  return signals.map((s) => {
    const slugs = slugsByCode.get(s.code) ?? [];
    const ids = slugs.map((slug) => idBySlug.get(slug)).filter((id): id is string => Boolean(id));
    return { ...s, suggestedDeficitSlugs: slugs, suggestedDeficitIds: ids };
  });
}

/** The opponent's tendencies from every game the team has played against it. */
async function loadOpponentTendencies(db: SupabaseClient, teamId: string, opponentTeamId?: string): Promise<DerivedScoutingTag[]> {
  if (!opponentTeamId) return [];

  const [pastGamesResult, oppPlayersResult] = await Promise.all([
    db.from('games').select('id').eq('team_id', teamId).eq('opponent_team_id', opponentTeamId),
    db.from('opponent_players').select('*').eq('opponent_team_id', opponentTeamId),
  ]);
  if (pastGamesResult.error) throw new Error(`Failed to load past games: ${pastGamesResult.error.message}`);
  if (oppPlayersResult.error) throw new Error(`Failed to load opponent roster: ${oppPlayersResult.error.message}`);

  const gameIds = ((pastGamesResult.data ?? []) as Array<{ id: string }>).map((g) => g.id);
  let events: GameEvent[] = [];
  if (gameIds.length > 0) {
    const { data, error } = await db.from('game_events').select('*').in('game_id', gameIds);
    if (error) throw new Error(`Failed to load scouting events: ${error.message}`);
    events = ((data ?? []) as RawEvent[]).map(mapEvent);
  }

  const players: OpponentPlayer[] = (
    (oppPlayersResult.data ?? []) as Array<{
      id: string;
      opponent_team_id: string;
      first_name: string;
      last_name: string;
      primary_position: string | null;
      bats: string | null;
      throws: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    opponentTeamId: r.opponent_team_id,
    firstName: r.first_name,
    lastName: r.last_name,
    primaryPosition: (r.primary_position ?? undefined) as OpponentPlayer['primaryPosition'],
    bats: (r.bats ?? undefined) as OpponentPlayer['bats'],
    throws: (r.throws ?? undefined) as OpponentPlayer['throws'],
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return deriveOpponentTendencies(events, players);
}

/** The team's drills with their deficit tags (system and the team's own). */
async function loadDrillsAndTags(
  db: SupabaseClient,
  teamId: string,
): Promise<{ drills: PracticeDrill[]; tagsByDrill: Map<string, PracticeDrillDeficitTag[]> }> {
  const [drillsResult, tagsResult] = await Promise.all([
    db.from('practice_drills').select('*').or(`team_id.is.null,team_id.eq.${teamId}`),
    db.from('practice_drill_deficit_tags').select('*').or(`team_id.is.null,team_id.eq.${teamId}`),
  ]);
  if (drillsResult.error) throw new Error(`Failed to load drills: ${drillsResult.error.message}`);
  if (tagsResult.error) throw new Error(`Failed to load drill deficit tags: ${tagsResult.error.message}`);

  const drills = ((drillsResult.data ?? []) as Array<Record<string, unknown>>).map(mapDrillRow);
  const tagsByDrill = new Map<string, PracticeDrillDeficitTag[]>();
  for (const r of (tagsResult.data ?? []) as Array<{
    id: string;
    drill_id: string;
    deficit_id: string;
    team_id: string | null;
    priority: string;
    created_by: string | null;
    created_at: string;
  }>) {
    const tag: PracticeDrillDeficitTag = {
      id: r.id,
      drillId: r.drill_id,
      deficitId: r.deficit_id,
      teamId: r.team_id,
      priority: r.priority as PracticeDrillDeficitPriority,
      createdBy: r.created_by ?? undefined,
      createdAt: r.created_at,
    };
    const list = tagsByDrill.get(tag.drillId);
    if (list) list.push(tag);
    else tagsByDrill.set(tag.drillId, [tag]);
  }
  return { drills, tagsByDrill };
}

function mapEvent(r: RawEvent): GameEvent {
  return {
    id: r.id,
    gameId: r.game_id,
    sequenceNumber: r.sequence_number,
    eventType: r.event_type as EventType,
    inning: r.inning,
    isTopOfInning: r.is_top_of_inning,
    payload: r.payload,
    occurredAt: r.occurred_at,
    createdBy: r.created_by,
    deviceId: r.device_id,
  };
}

function groupSlugs(rows: Array<{ weakness_code: string; deficit_slug: string }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.weakness_code);
    if (list) list.push(r.deficit_slug);
    else map.set(r.weakness_code, [r.deficit_slug]);
  }
  return map;
}
