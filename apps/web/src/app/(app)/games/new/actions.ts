'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createGame } from '@/lib/services/games/create-game';
import { gameFormFieldsFromFormData } from '@/lib/services/games/game-form-data';

export async function createGameAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await createGame(supabase, user.id, {
    teamId: formData.get('teamId'),
    tournamentId: (formData.get('tournamentId') as string | null)?.trim() || null,
    notifyTeam: formData.get('notifyTeam') === 'on',
    ...gameFormFieldsFromFormData(formData),
  });
  if (!result.ok) return result.error;

  redirect(`/games/${result.data.gameId}`);
}
