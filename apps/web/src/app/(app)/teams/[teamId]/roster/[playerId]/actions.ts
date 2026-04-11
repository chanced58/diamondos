'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { updatePlayerSchema } from '@baseball/shared';
import { canManageRoster } from '@/lib/roster-access';

export async function updatePlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  if (!teamId || !playerId) return 'Missing required IDs.';

  const secondaryPositions = formData.getAll('secondaryPositions') as string[];
  const email = (formData.get('email') as string)?.toLowerCase().trim() || undefined;
  const phone = (formData.get('phone') as string)?.trim() || undefined;

  const raw = {
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    jerseyNumber: formData.get('jerseyNumber')
      ? Number(formData.get('jerseyNumber'))
      : undefined,
    primaryPosition: (formData.get('primaryPosition') as string) || undefined,
    bats: (formData.get('bats') as string) || undefined,
    throws: (formData.get('throws') as string) || undefined,
    graduationYear: formData.get('graduationYear')
      ? Number(formData.get('graduationYear'))
      : undefined,
    email: email || '',
    phone,
  };

  const parsed = updatePlayerSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.errors[0].message;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase
    .from('players')
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      jersey_number: parsed.data.jerseyNumber ?? null,
      primary_position: parsed.data.primaryPosition ?? null,
      secondary_positions: secondaryPositions,
      bats: parsed.data.bats ?? null,
      throws: parsed.data.throws ?? null,
      graduation_year: parsed.data.graduationYear ?? null,
      email: email || null,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId);
  if (error) return `Failed to update player: ${error.message}`;

  // Keep jersey_number in sync on the active player_team_memberships record
  await supabase
    .from('player_team_memberships')
    .update({ jersey_number: parsed.data.jerseyNumber ?? null })
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .eq('is_active', true);

  redirect(`/teams/${teamId}/roster`);
}

export async function deactivatePlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  if (!teamId || !playerId) return 'Missing required IDs.';

  const allowed = await canManageRoster(teamId, user.id);
  if (!allowed) return 'You do not have permission to remove players from this roster.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase
    .from('players')
    .update({
      is_active: false,
      jersey_number: null,
      disabled_at: new Date().toISOString(),
      disabled_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId);
  if (error) return `Failed to remove player: ${error.message}`;

  // Also deactivate the player_team_memberships record
  await supabase
    .from('player_team_memberships')
    .update({ is_active: false, left_at: new Date().toISOString(), transfer_reason: 'deactivated' })
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .eq('is_active', true);

  redirect(`/teams/${teamId}/roster`);
}
