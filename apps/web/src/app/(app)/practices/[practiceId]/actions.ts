'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { formatDate } from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';

export async function cancelPracticeAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const practiceId = formData.get('practiceId') as string;
  if (!practiceId) return 'Missing practice ID.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: practice } = await supabase
    .from('practices')
    .select('team_id, scheduled_at')
    .eq('id', practiceId)
    .single();

  if (!practice) return 'Practice not found.';

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', practice.team_id)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can cancel practices.';

  const { error } = await supabase
    .from('practices')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', practiceId);

  if (error) return `Failed to cancel practice: ${error.message}`;

  if (formData.get('notifyTeam') === 'on') {
    const msg = `❌ Practice on ${formatDate(practice.scheduled_at)} has been cancelled.`;
    await postEventAlert(supabase, practice.team_id, user.id, msg);
  }

  redirect('/practices');
}

// ─── Coach: save overall, coach, and per-player categorical notes ─────────────

export async function savePracticeNotesAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const practiceId = formData.get('practiceId') as string;
  const teamId = formData.get('teamId') as string;
  if (!practiceId || !teamId) return 'Missing required IDs.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can save practice notes.';

  const overallNotes = (formData.get('overall_notes') as string) ?? '';
  const coachNotes = (formData.get('coach_notes') as string) ?? '';

  const { error: notesError } = await supabase
    .from('practice_notes')
    .upsert(
      {
        practice_id: practiceId,
        overall_notes: overallNotes || null,
        coach_notes: coachNotes || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'practice_id' },
    );
  if (notesError) return `Failed to save notes: ${notesError.message}`;

  // Collect player categorical notes (keys: player_<uuid>_<category>)
  const playerMap = new Map<string, Record<string, string>>();
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^player_([0-9a-f-]{36})_(.+)$/);
    if (!match) continue;
    const [, playerId, category] = match;
    if (!playerMap.has(playerId)) playerMap.set(playerId, {});
    playerMap.get(playerId)![category] = value as string;
  }

  if (playerMap.size > 0) {
    const rows = Array.from(playerMap.entries()).map(([playerId, notes]) => ({
      practice_id: practiceId,
      player_id: playerId,
      pitching: notes.pitching || null,
      hitting: notes.hitting || null,
      fielding_catching: notes.fielding_catching || null,
      baserunning: notes.baserunning || null,
      athleticism: notes.athleticism || null,
      attitude: notes.attitude || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }));

    const { error: playerError } = await supabase
      .from('practice_player_notes')
      .upsert(rows, { onConflict: 'practice_id,player_id' });
    if (playerError) return `Failed to save player notes: ${playerError.message}`;
  }

  return 'saved';
}

// ─── Player: save only their own self-reflection notes ───────────────────────

export async function savePlayerSelfNotesAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const practiceId = formData.get('practiceId') as string;
  const playerId = formData.get('playerId') as string;
  const playerNotes = (formData.get('player_notes') as string) || null;

  if (!practiceId || !playerId) return 'Missing required IDs.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify the player record belongs to this user
  const { data: player } = await supabase
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .single();

  if (!player) return 'Player record not found for your account.';

  // Verify the practice belongs to the same team
  const { data: practice } = await supabase
    .from('practices')
    .select('id')
    .eq('id', practiceId)
    .eq('team_id', player.team_id)
    .single();

  if (!practice) return 'Practice not found.';

  // Upsert only the player_notes column — coach categorical notes are untouched
  const { error } = await supabase
    .from('practice_player_notes')
    .upsert(
      {
        practice_id: practiceId,
        player_id: playerId,
        player_notes: playerNotes,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'practice_id,player_id' },
    );
  if (error) return `Failed to save notes: ${error.message}`;

  return 'saved';
}

export async function savePracticePlanAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const practiceId = formData.get('practiceId') as string;
  const plan = formData.get('plan') as string;
  if (!practiceId) return 'Missing practice ID.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: practice } = await supabase
    .from('practices')
    .select('team_id')
    .eq('id', practiceId)
    .single();

  if (!practice) return 'Practice not found.';

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', practice.team_id)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can edit the practice plan.';

  const { error } = await supabase
    .from('practices')
    .update({ plan })
    .eq('id', practiceId);

  if (error) return `Failed to save plan: ${error.message}`;

  return 'saved';
}
