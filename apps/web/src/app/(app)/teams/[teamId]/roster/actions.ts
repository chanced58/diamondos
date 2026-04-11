'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { canManageRoster } from '@/lib/roster-access';

export async function removePlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  if (!teamId || !playerId) return 'Missing required IDs.';

  const allowed = await canManageRoster(teamId, user.id);
  if (!allowed) return 'You do not have permission to remove players from this roster.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('players')
    .update({
      is_active: false,
      jersey_number: null,
      disabled_at: now,
      disabled_by: user.id,
      updated_at: now,
    })
    .eq('id', playerId)
    .eq('team_id', teamId);

  if (error) return `Failed to remove player: ${error.message}`;

  // Deactivate the player_team_memberships record
  const { error: membershipError } = await supabase
    .from('player_team_memberships')
    .update({ is_active: false, left_at: now, transfer_reason: 'removed' })
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .eq('is_active', true);

  if (membershipError) {
    // Revert the player update so the two tables stay consistent
    await supabase
      .from('players')
      .update({ is_active: true, jersey_number: null, disabled_at: null, disabled_by: null })
      .eq('id', playerId)
      .eq('team_id', teamId);
    return `Failed to update membership: ${membershipError.message}`;
  }

  redirect(`/teams/${teamId}/roster`);
}

export async function reactivatePlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const jerseyNumber = formData.get('jerseyNumber')
    ? Number(formData.get('jerseyNumber'))
    : null;
  if (!teamId || !playerId) return 'Missing required IDs.';

  const allowed = await canManageRoster(teamId, user.id);
  if (!allowed) return 'You do not have permission to manage this roster.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Reactivate the player
  const { error } = await supabase
    .from('players')
    .update({
      is_active: true,
      jersey_number: jerseyNumber,
      disabled_at: null,
      disabled_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId)
    .eq('team_id', teamId);

  if (error) return `Failed to reactivate player: ${error.message}`;

  // Reactivate or create the player_team_memberships record
  const { data: existing } = await supabase
    .from('player_team_memberships')
    .select('id')
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .maybeSingle();

  let membershipError: { message: string } | null = null;
  if (existing) {
    const { error: updateErr } = await supabase
      .from('player_team_memberships')
      .update({
        is_active: true,
        jersey_number: jerseyNumber,
        left_at: null,
        transfer_reason: null,
      })
      .eq('id', existing.id);
    membershipError = updateErr;
  } else {
    const { error: insertErr } = await supabase
      .from('player_team_memberships')
      .insert({
        player_id: playerId,
        team_id: teamId,
        jersey_number: jerseyNumber,
        is_active: true,
      });
    membershipError = insertErr;
  }

  if (membershipError) {
    // Revert the player update so the two tables stay consistent
    await supabase
      .from('players')
      .update({ is_active: false, disabled_at: new Date().toISOString(), disabled_by: user.id })
      .eq('id', playerId)
      .eq('team_id', teamId);
    return `Failed to update membership: ${membershipError.message}`;
  }

  redirect(`/teams/${teamId}/roster`);
}
