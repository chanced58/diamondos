import type { SupabaseClient } from '@supabase/supabase-js';
import {
  practiceIdInputSchema,
  type PracticeAttendance,
  type PracticeRepOutcomeCategory,
  type PracticeSummaryResponse,
} from '@baseball/shared';
import { getPracticeSummary, listPracticeAttendance, upsertPracticeSummary } from '@baseball/database';
import {
  summarizePractice,
  type PracticeSummaryBlock,
  type PracticeSummaryPlayer,
  type PracticeSummaryRep,
} from '@/lib/ai/practice-summary';
import { logAiGeneration } from '@/lib/ai/log-generation';
import { AI_MODELS } from '@/lib/ai/client';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { failed } from './practice-lookup';

/**
 * The AI post-practice summary (the web practice page's Summary section),
 * shared with the mobile routes: Claude's recap of the blocks, reps,
 * attendance and notes, with standouts, concerns and a line per player.
 * Coaches only — it speaks about every player, and the web only shows it to
 * coaches.
 */

type PracticeRow = {
  id: string;
  team_id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  prep_focus_summary: string | null;
};

/** The practice's saved summary, or null before a coach generates one. */
export async function loadPracticeSummary(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PracticeSummaryResponse>> {
  const parsed = practiceIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { practiceId } = parsed.data;

  const access = await authorizeCoach(db, practiceId, actorUserId, 'loadPracticeSummary', 'Only coaches can see the summary.');
  if ('result' in access) return access.result;

  try {
    return serviceOk({ summary: await getPracticeSummary(db as never, practiceId) });
  } catch (error) {
    return failed('loadPracticeSummary', practiceId, actorUserId, error);
  }
}

/** Generates (or regenerates) the summary and saves it; player ids the model made up are dropped. */
export async function generatePracticeSummary(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PracticeSummaryResponse>> {
  const parsed = practiceIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { practiceId } = parsed.data;

  const access = await authorizeCoach(db, practiceId, actorUserId, 'generatePracticeSummary', 'Only coaches can generate summaries.');
  if ('result' in access) return access.result;
  const { practice } = access;
  const teamId = practice.team_id;

  const start = Date.now();
  try {
    const ctx = await loadSummaryContext(db, practiceId, teamId);
    const result = await summarizePractice({
      scheduledAt: practice.scheduled_at,
      durationMinutes: practice.duration_minutes ?? null,
      focusSummary: practice.prep_focus_summary ?? null,
      overallNotes: ctx.overallNotes,
      coachNotes: ctx.coachNotes,
      blocks: ctx.blocks,
      reps: ctx.reps,
      players: ctx.players,
      attendedPlayerIds: ctx.attendedPlayerIds,
      playerNotes: ctx.playerNotes,
    });

    const allowedIds = new Set(ctx.attendedPlayerIds);
    const summary = {
      coachRecap: result.summary.coachRecap,
      standoutPlayers: result.summary.standoutPlayers.filter((s) => allowedIds.has(s.playerId)),
      concerns: result.summary.concerns.map((c) => ({
        playerId: c.playerId && allowedIds.has(c.playerId) ? c.playerId : null,
        note: c.note,
      })),
      playerSummaries: Object.fromEntries(Object.entries(result.summary.playerSummaries).filter(([pid]) => allowedIds.has(pid))),
    };
    const persisted = await upsertPracticeSummary(db as never, {
      practiceId,
      teamId,
      summary,
      model: result.model,
      generatedBy: actorUserId,
    });

    await logAiGeneration({
      feature: 'practice_summary',
      teamId,
      userId: actorUserId,
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - start,
      status: 'success',
    });
    return serviceOk({ summary: persisted });
  } catch (error) {
    await logAiGeneration({
      feature: 'practice_summary',
      teamId,
      userId: actorUserId,
      model: AI_MODELS.sonnet,
      latencyMs: Date.now() - start,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return failed('generatePracticeSummary', practiceId, actorUserId, error);
  }
}

/** The practice, when the actor coaches its team. */
async function authorizeCoach(
  db: SupabaseClient,
  practiceId: string,
  actorUserId: string,
  service: string,
  refusal: string,
): Promise<{ result: ServiceResult<never> } | { practice: PracticeRow }> {
  const { data, error } = await db
    .from('practices')
    .select('id, team_id, scheduled_at, duration_minutes, prep_focus_summary')
    .eq('id', practiceId)
    .maybeSingle();
  if (error) return { result: failed(service, practiceId, actorUserId, error) };
  if (!data) return { result: serviceError('not_found', 'Practice not found.') };
  const practice = data as PracticeRow;

  const viewer = await resolveGameViewer(db, actorUserId, practice.team_id);
  if (!viewer?.isCoach) return { result: serviceError('forbidden', refusal) };
  return { practice };
}

interface SummaryContext {
  blocks: PracticeSummaryBlock[];
  reps: PracticeSummaryRep[];
  players: PracticeSummaryPlayer[];
  attendedPlayerIds: string[];
  overallNotes: string | null;
  coachNotes: string | null;
  playerNotes: Record<string, string | null | undefined>;
}

/** Everything the summarizer reads about the practice. */
async function loadSummaryContext(db: SupabaseClient, practiceId: string, teamId: string): Promise<SummaryContext> {
  const [blocksResult, drillsResult, repsResult, attendanceList, playersResult, notesResult, playerNotesResult] = await Promise.all([
    db
      .from('practice_blocks')
      .select('title, block_type, planned_duration_minutes, actual_duration_minutes, drill_id, status, notes, position')
      .eq('practice_id', practiceId)
      .order('position'),
    db.from('practice_drills').select('id, name').or(`team_id.is.null,team_id.eq.${teamId}`),
    db.from('practice_reps').select('*').eq('practice_id', practiceId).order('recorded_at'),
    listPracticeAttendance(db as never, practiceId),
    db.from('players').select('id, first_name, last_name, jersey_number').eq('team_id', teamId).eq('is_active', true),
    db.from('practice_notes').select('overall_notes, coach_notes').eq('practice_id', practiceId).maybeSingle(),
    db
      .from('practice_player_notes')
      .select('player_id, pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes')
      .eq('practice_id', practiceId),
  ]);
  if (blocksResult.error) throw new Error(blocksResult.error.message);
  if (drillsResult.error) throw new Error(drillsResult.error.message);
  if (repsResult.error) throw new Error(repsResult.error.message);
  if (playersResult.error) throw new Error(playersResult.error.message);
  if (notesResult.error) throw new Error(notesResult.error.message);
  if (playerNotesResult.error) throw new Error(playerNotesResult.error.message);

  const drillNameById = new Map<string, string>();
  for (const d of (drillsResult.data ?? []) as Array<{ id: string; name: string }>) drillNameById.set(d.id, d.name);

  const blocks: PracticeSummaryBlock[] = (
    (blocksResult.data ?? []) as Array<{
      title: string;
      block_type: string;
      planned_duration_minutes: number;
      actual_duration_minutes: number | null;
      drill_id: string | null;
      status: string;
      notes: string | null;
    }>
  ).map((b) => ({
    title: b.title,
    blockType: b.block_type,
    plannedDurationMinutes: b.planned_duration_minutes,
    actualDurationMinutes: b.actual_duration_minutes,
    drillName: b.drill_id ? drillNameById.get(b.drill_id) ?? null : null,
    status: b.status,
    notes: b.notes,
  }));

  const reps: PracticeSummaryRep[] = (
    (repsResult.data ?? []) as Array<{
      player_id: string | null;
      outcome_category: string;
      outcome: string;
      coach_tag: string | null;
      drill_id: string | null;
      recorded_at: string;
    }>
  ).map((r) => ({
    playerId: r.player_id,
    outcomeCategory: r.outcome_category as PracticeRepOutcomeCategory,
    outcome: r.outcome,
    coachTag: r.coach_tag,
    drillName: r.drill_id ? drillNameById.get(r.drill_id) ?? null : null,
    recordedAt: r.recorded_at,
  }));

  const players: PracticeSummaryPlayer[] = (
    (playersResult.data ?? []) as Array<{ id: string; first_name: string; last_name: string; jersey_number: number | null }>
  ).map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name, jerseyNumber: p.jersey_number }));

  // Present or late counts as attended. Without attendance logged, everyone
  // on the roster does — otherwise the summary would skip every player.
  const attended = attendanceList
    .filter((a: PracticeAttendance) => a.status === 'present' || a.status === 'late')
    .map((a: PracticeAttendance) => a.playerId);

  const playerNotes: Record<string, string> = {};
  for (const row of (playerNotesResult.data ?? []) as Array<{
    player_id: string;
    pitching: string | null;
    hitting: string | null;
    fielding_catching: string | null;
    baserunning: string | null;
    athleticism: string | null;
    attitude: string | null;
    player_notes: string | null;
  }>) {
    const parts: string[] = [];
    if (row.pitching) parts.push(`pitching: ${row.pitching}`);
    if (row.hitting) parts.push(`hitting: ${row.hitting}`);
    if (row.fielding_catching) parts.push(`fielding/catching: ${row.fielding_catching}`);
    if (row.baserunning) parts.push(`baserunning: ${row.baserunning}`);
    if (row.athleticism) parts.push(`athleticism: ${row.athleticism}`);
    if (row.attitude) parts.push(`attitude: ${row.attitude}`);
    if (row.player_notes) parts.push(`notes: ${row.player_notes}`);
    if (parts.length > 0) playerNotes[row.player_id] = parts.join('; ');
  }

  const notes = notesResult.data ?? null;
  return {
    blocks,
    // The summarizer prioritizes and caps reps itself.
    reps,
    players,
    attendedPlayerIds: attended.length > 0 ? attended : players.map((p) => p.id),
    overallNotes: (notes?.overall_notes as string | null) ?? null,
    coachNotes: (notes?.coach_notes as string | null) ?? null,
    playerNotes,
  };
}
