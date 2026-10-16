'use server';

import { redirect } from 'next/navigation';
import { createTournament } from '@baseball/database';
import { createServerClient } from '@/lib/supabase/server';
import { parseTournamentFormData } from '@/lib/tournament-form';

export async function createTournamentAction(
  _previousError: string | null,
  formData: FormData,
): Promise<string | null> {
  const client = createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return 'Your session ended. Please sign in and try again.';

  const parsed = parseTournamentFormData(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Check the tournament details and try again.';

  try {
    const created = await createTournament(client, parsed.data);
    redirect(`/tournaments/${created.tournamentId}`);
  } catch (error) {
    if (error instanceof Error && 'digest' in error) throw error;
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Unknown error';
    if (message.includes('active head coach or athletic director')) {
      return 'You must be an active head coach or athletic director for the selected team.';
    }
    console.error(`[tournaments] creation failed user=${user.id}: ${message}`);
    return 'Tournament creation failed. Your entries are still here; please try again.';
  }
}
