'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { PRACTICE_NOTE_CATEGORIES } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { cancelPractice } from '@/lib/services/practices/practices';
import { savePracticeNotes, savePracticePlan, savePracticeSelfNotes } from '@/lib/services/practices/practice-notes';

/**
 * The practice page's forms. Each is a thin wrapper over the service the
 * mobile `/api/m/v1/practices/:id/*` routes share, which authorizes against
 * the practice's own team.
 */

async function authenticate() {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return { user, db };
}

export async function cancelPracticeAction(_prevState: string | null | undefined, formData: FormData) {
  const session = await authenticate();
  if (!session) return 'Not authenticated.';

  const practiceId = formData.get('practiceId') as string;
  if (!practiceId) return 'Missing practice ID.';

  const result = await cancelPractice(session.db, session.user.id, {
    practiceId,
    notifyTeam: formData.get('notifyTeam') === 'on',
    timeZone: (formData.get('browserTimeZone') as string | null) || null,
  });
  if (!result.ok) return result.error;

  redirect('/practices');
}

// ─── Coach: save overall, coach, and per-player categorical notes ─────────────

export async function savePracticeNotesAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const session = await authenticate();
  if (!session) return 'Not authenticated — please log in again.';

  const practiceId = formData.get('practiceId') as string;
  if (!practiceId) return 'Missing required IDs.';

  // Player categorical notes arrive as player_<uuid>_<category>.
  const categories = new Set<string>(PRACTICE_NOTE_CATEGORIES.map(({ key }) => key));
  const players = new Map<string, Record<string, string>>();
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^player_([0-9a-f-]{36})_(.+)$/);
    if (!match || !categories.has(match[2])) continue;
    const notes = players.get(match[1]) ?? {};
    notes[match[2]] = value as string;
    players.set(match[1], notes);
  }

  const result = await savePracticeNotes(session.db, session.user.id, {
    practiceId,
    overallNotes: (formData.get('overall_notes') as string) ?? '',
    coachNotes: (formData.get('coach_notes') as string) ?? '',
    players: [...players].map(([playerId, notes]) => ({ playerId, ...notes })),
  });
  return result.ok ? 'saved' : result.error;
}

// ─── Player: save only their own self-reflection notes ───────────────────────

export async function savePlayerSelfNotesAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const session = await authenticate();
  if (!session) return 'Not authenticated — please log in again.';

  const practiceId = formData.get('practiceId') as string;
  const playerId = formData.get('playerId') as string;
  if (!practiceId || !playerId) return 'Missing required IDs.';

  const result = await savePracticeSelfNotes(session.db, session.user.id, {
    practiceId,
    playerId,
    playerNotes: (formData.get('player_notes') as string) || null,
  });
  return result.ok ? 'saved' : result.error;
}

export async function savePracticePlanAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const session = await authenticate();
  if (!session) return 'Not authenticated.';

  const practiceId = formData.get('practiceId') as string;
  if (!practiceId) return 'Missing practice ID.';

  const result = await savePracticePlan(session.db, session.user.id, {
    practiceId,
    plan: (formData.get('plan') as string) ?? '',
  });
  return result.ok ? 'saved' : result.error;
}
