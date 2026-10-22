import type { SupabaseClient } from '@supabase/supabase-js';
import { saveOpponentTeamInputSchema } from '@baseball/shared';
import { invalidInput, serviceOk, type ServiceResult } from '../result';
import { authorizeOpponentLineupEdit, writeFailed } from './context';

/**
 * Names the game's opponent team: renames the team already linked to the
 * game, or creates one for the coach's team and links it. Only ever the
 * game's own link — never a team id the caller names.
 */
export async function saveOpponentTeam(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ opponentTeamId: string }>> {
  const parsed = saveOpponentTeamInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, name } = parsed.data;

  const auth = await authorizeOpponentLineupEdit(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const game = auth.data;
  const now = new Date().toISOString();

  if (game.opponentTeamId) {
    const { error } = await db
      .from('opponent_teams')
      .update({ name, updated_at: now })
      .eq('id', game.opponentTeamId)
      .eq('team_id', game.teamId);
    if (error) return writeFailed('saveOpponentTeam', gameId, actorUserId, error);
    return serviceOk({ opponentTeamId: game.opponentTeamId });
  }

  const { data: created, error: insertError } = await db
    .from('opponent_teams')
    .insert({ team_id: game.teamId, name, created_by: actorUserId })
    .select('id')
    .single();
  if (insertError || !created) {
    return writeFailed('saveOpponentTeam', gameId, actorUserId, insertError ?? { message: 'no row returned' });
  }

  const { error: linkError } = await db.from('games').update({ opponent_team_id: created.id }).eq('id', gameId);
  if (linkError) return writeFailed('saveOpponentTeam', gameId, actorUserId, linkError);

  return serviceOk({ opponentTeamId: created.id as string });
}
