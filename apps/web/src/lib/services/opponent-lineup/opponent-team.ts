import type { SupabaseClient } from '@supabase/supabase-js';
import { saveOpponentTeamInputSchema } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeOpponentLineupEdit, isLeagueRosterRecord, writeFailed } from './context';

/**
 * Names the game's opponent team: renames the team already linked to the
 * game, or creates one for the coach's team and links it. Only ever the
 * game's own link — never a team id the caller names. A league game's
 * opponent is the other team's league roster record, set by the league:
 * it is never re-pointed or renamed from here, nor is any roster record.
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

  if (game.leagueGameId) return serviceError('conflict', "A league game's opponent is set by the league.");

  if (game.opponentTeamId) {
    const rosterRecord = await isLeagueRosterRecord(db, game.opponentTeamId);
    if (!rosterRecord.ok) return rosterRecord;
    if (rosterRecord.data) return serviceError('conflict', "This team's name comes from the league.");

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
