'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Transfer a player from one team to another.
 *
 * This action:
 * 1. Deactivates the old player_team_memberships row
 * 2. Creates a new membership on the destination team
 * 3. Updates players.team_id (denormalized current team)
 * 4. Logs the transfer in player_transfers for audit
 */
export async function transferPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const playerId = formData.get('playerId') as string;
  const fromTeamId = formData.get('fromTeamId') as string;
  const toTeamId = formData.get('toTeamId') as string;
  const reason = (formData.get('reason') as string)?.trim() || 'transfer';
  const notes = (formData.get('notes') as string)?.trim() || null;
  const jerseyRaw = (formData.get('jerseyNumber') as string)?.trim();
  const jerseyNumber = jerseyRaw ? parseInt(jerseyRaw, 10) : null;

  if (!playerId || !fromTeamId || !toTeamId) return 'Missing required fields.';
  if (fromTeamId === toTeamId) return 'Source and destination teams must be different.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify the current user is a coach on the source team
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', fromTeamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can transfer players.';

  // Verify the destination team exists
  const { data: destTeam } = await supabase
    .from('teams')
    .select('id')
    .eq('id', toTeamId)
    .maybeSingle();

  if (!destTeam) return 'Destination team not found.';

  const now = new Date().toISOString();

  // 1. Deactivate old membership
  const { error: deactivateErr } = await supabase
    .from('player_team_memberships')
    .update({ is_active: false, left_at: now, transfer_reason: reason })
    .eq('player_id', playerId)
    .eq('team_id', fromTeamId)
    .eq('is_active', true);

  if (deactivateErr) return `Failed to deactivate old membership: ${deactivateErr.message}`;

  // 2. Create new membership on destination team
  const { error: newMemberErr } = await supabase
    .from('player_team_memberships')
    .insert({
      player_id: playerId,
      team_id: toTeamId,
      jersey_number: jerseyNumber,
      is_active: true,
    });

  if (newMemberErr) return `Failed to create new membership: ${newMemberErr.message}`;

  // 3. Update denormalized players.team_id
  const { error: updateErr } = await supabase
    .from('players')
    .update({ team_id: toTeamId, updated_at: now })
    .eq('id', playerId);

  if (updateErr) return `Failed to update player team: ${updateErr.message}`;

  // 4. Log the transfer for audit
  const { error: transferErr } = await supabase
    .from('player_transfers')
    .insert({
      player_id: playerId,
      from_team_id: fromTeamId,
      to_team_id: toTeamId,
      reason,
      notes,
      initiated_by: user.id,
      transferred_at: now,
    });

  if (transferErr) {
    console.error('[transfer-player] Failed to log transfer:', transferErr.message);
    // Non-fatal — the transfer itself succeeded
  }

  return 'transferred';
}
