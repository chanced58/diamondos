'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { canManageRoster } from '@/lib/roster-access';

export async function addInjuryFlagAction(_prev: string | null | undefined, formData: FormData) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const injurySlug = formData.get('injurySlug') as string;
  const effectiveFrom = (formData.get('effectiveFrom') as string) || new Date().toISOString().slice(0, 10);
  const effectiveTo = (formData.get('effectiveTo') as string) || null;
  const notes = (formData.get('notes') as string)?.trim() || null;

  if (!teamId || !playerId || !injurySlug) return 'Missing required fields.';
  if (effectiveTo && effectiveTo < effectiveFrom) return 'End date must be on or after start date.';
  if (!(await canManageRoster(teamId, user.id))) return 'Not authorized.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Defensive: confirm the player is on this team. canManageRoster gates the
  // *caller's* authority on teamId, but without this check a request could
  // smuggle a player from another team via the hidden playerId field.
  const { data: playerRow } = await supabase
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .maybeSingle();
  if (!playerRow || playerRow.team_id !== teamId) {
    return 'Player does not belong to this team.';
  }

  const { error } = await supabase.from('player_injury_flags').insert({
    player_id: playerId,
    injury_slug: injurySlug,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    notes,
    created_by: user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return 'This player already has an open-ended flag for that injury. End it first, or set an end date on the new flag.';
    }
    return `Save failed: ${error.message}`;
  }

  revalidatePath(`/teams/${teamId}/roster/${playerId}/availability`);
  return null;
}

export async function endInjuryFlagAction(_prev: string | null | undefined, formData: FormData) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const flagId = formData.get('flagId') as string;
  const endDate = (formData.get('endDate') as string) || new Date().toISOString().slice(0, 10);

  if (!teamId || !playerId || !flagId) return 'Missing ids.';
  if (!(await canManageRoster(teamId, user.id))) return 'Not authorized.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Scope the update to (flagId, playerId) and verify the player's team. This
  // prevents a forged request from ending a flag on another team's player.
  const { data: flagRow } = await supabase
    .from('player_injury_flags')
    .select('id, player_id, players(team_id)')
    .eq('id', flagId)
    .eq('player_id', playerId)
    .maybeSingle();
  const flag = flagRow as unknown as { id: string; player_id: string; players: { team_id: string } } | null;
  if (!flag || flag.players.team_id !== teamId) return 'Flag not found on this team.';

  const { error } = await supabase
    .from('player_injury_flags')
    .update({ effective_to: endDate })
    .eq('id', flagId);
  if (error) return `Save failed: ${error.message}`;

  revalidatePath(`/teams/${teamId}/roster/${playerId}/availability`);
  return null;
}
