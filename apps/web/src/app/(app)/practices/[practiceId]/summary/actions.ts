'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  PersistedPracticeSummary,
  PracticeAttendance,
  PracticeRepOutcomeCategory,
} from '@baseball/shared';
import {
  getPracticeSummary,
  listPracticeAttendance,
  upsertPracticeSummary,
} from '@baseball/database';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import {
  summarizePractice,
  type PracticeSummaryBlock,
  type PracticeSummaryPlayer,
  type PracticeSummaryRep,
} from '@/lib/ai/practice-summary';

type SupabaseUntyped = SupabaseClient;

export async function generatePracticeSummaryAction(
  practiceId: string,
): Promise<PersistedPracticeSummary | string> {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: practice, error: practiceErr } = await db
    .from('practices')
    .select(
      'id, team_id, scheduled_at, duration_minutes, prep_focus_summary, plan',
    )
    .eq('id', practiceId)
    .maybeSingle();
  if (practiceErr) return `Failed to load practice: ${practiceErr.message}`;
  if (!practice) return 'Practice not found.';

  const teamId = practice.team_id as string;
  const { isCoach } = await getUserAccess(teamId, user.id);
  if (!isCoach) return 'Only coaches can generate summaries.';

  try {
    const ctx = await loadSummaryContext(db, practiceId, teamId);
    const result = await summarizePractice({
      scheduledAt: practice.scheduled_at as string,
      durationMinutes: (practice.duration_minutes as number | null) ?? null,
      focusSummary: (practice.prep_focus_summary as string | null) ?? null,
      overallNotes: ctx.overallNotes,
      coachNotes: ctx.coachNotes,
      blocks: ctx.blocks,
      reps: ctx.reps,
      players: ctx.players,
      attendedPlayerIds: ctx.attendedPlayerIds,
      playerNotes: ctx.playerNotes,
    });

    // Defense-in-depth: strip any playerId the model invented.
    const allowedIds = new Set(ctx.attendedPlayerIds);
    const sanitized = {
      coachRecap: result.summary.coachRecap,
      standoutPlayers: result.summary.standoutPlayers.filter((s) =>
        allowedIds.has(s.playerId),
      ),
      concerns: result.summary.concerns.map((c) => ({
        playerId: c.playerId && allowedIds.has(c.playerId) ? c.playerId : null,
        note: c.note,
      })),
      playerSummaries: Object.fromEntries(
        Object.entries(result.summary.playerSummaries).filter(([pid]) =>
          allowedIds.has(pid),
        ),
      ),
    };

    const persisted = await upsertPracticeSummary(db as never, {
      practiceId,
      teamId,
      summary: sanitized,
      model: result.model,
      generatedBy: user.id,
    });

    return persisted;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return `AI summary failed: ${msg}`;
  }
}

export async function loadPracticeSummaryAction(
  practiceId: string,
): Promise<PersistedPracticeSummary | null | string> {
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
    return await getPracticeSummary(db as never, practiceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return `Failed to load summary: ${msg}`;
  }
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

async function loadSummaryContext(
  db: SupabaseUntyped,
  practiceId: string,
  teamId: string,
): Promise<SummaryContext> {
  const [
    blocksResult,
    drillsResult,
    repsResult,
    attendanceList,
    playersResult,
    notesResult,
    playerNotesResult,
  ] = await Promise.all([
    db
      .from('practice_blocks')
      .select(
        'title, block_type, planned_duration_minutes, actual_duration_minutes, drill_id, status, notes, position',
      )
      .eq('practice_id', practiceId)
      .order('position'),
    db.from('practice_drills').select('id, name'),
    db
      .from('practice_reps')
      .select('*')
      .eq('practice_id', practiceId)
      .order('recorded_at'),
    listPracticeAttendance(db as never, practiceId),
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number')
      .eq('team_id', teamId)
      .eq('is_active', true),
    db
      .from('practice_notes')
      .select('overall_notes, coach_notes')
      .eq('practice_id', practiceId)
      .maybeSingle(),
    db
      .from('practice_player_notes')
      .select(
        'player_id, pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes',
      )
      .eq('practice_id', practiceId),
  ]);

  if (blocksResult.error) throw new Error(blocksResult.error.message);
  if (drillsResult.error) throw new Error(drillsResult.error.message);
  if (repsResult.error) throw new Error(repsResult.error.message);
  if (playersResult.error) throw new Error(playersResult.error.message);
  if (notesResult.error) throw new Error(notesResult.error.message);
  if (playerNotesResult.error) throw new Error(playerNotesResult.error.message);

  const drillNameById = new Map<string, string>();
  for (const d of (drillsResult.data ?? []) as Array<{ id: string; name: string }>) {
    drillNameById.set(d.id, d.name);
  }

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

  const rawReps = repsResult.data as unknown as Array<{
    player_id: string | null;
    outcome_category: string;
    outcome: string;
    coach_tag: string | null;
    drill_id: string | null;
  }>;
  const reps: PracticeSummaryRep[] = (rawReps ?? []).map((r) => ({
    playerId: r.player_id,
    outcomeCategory: r.outcome_category as PracticeRepOutcomeCategory,
    outcome: r.outcome,
    coachTag: r.coach_tag,
    drillName: r.drill_id ? drillNameById.get(r.drill_id) ?? null : null,
  }));

  const playerRows = (playersResult.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
  }>;
  const players: PracticeSummaryPlayer[] = playerRows.map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number,
  }));

  // Attendance: treat present or late as attended; absent / excused as not.
  const attendedPlayerIds = attendanceList
    .filter(
      (a: PracticeAttendance) => a.status === 'present' || a.status === 'late',
    )
    .map((a: PracticeAttendance) => a.playerId);

  // If attendance wasn't logged, fall back to treating all active roster
  // players as attended — otherwise the summary would skip everyone.
  const attendedOrFallback =
    attendedPlayerIds.length > 0
      ? attendedPlayerIds
      : players.map((p) => p.id);

  const notes = notesResult.data ?? null;
  const playerNotesMap: Record<string, string> = {};
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
    if (parts.length > 0) playerNotesMap[row.player_id] = parts.join('; ');
  }

  return {
    blocks,
    reps: reps.slice(0, 200), // cap to keep context bounded
    players,
    attendedPlayerIds: attendedOrFallback,
    overallNotes: (notes?.overall_notes as string | null) ?? null,
    coachNotes: (notes?.coach_notes as string | null) ?? null,
    playerNotes: playerNotesMap,
  };
}

