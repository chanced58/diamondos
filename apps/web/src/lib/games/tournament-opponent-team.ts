import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Give a tournament game's typed-in opponent an `opponent_teams` record.
 *
 * Regular games only get one when the web starts the game, but tournament
 * games are often started on a phone, and the mobile sync mirrors opponent
 * rosters and lineups through `games.opponent_team_id`. Without the record the
 * scorer has nothing to sync. Reuses the team's existing record with the same
 * name (case-insensitive) so an opponent met twice in a bracket keeps one
 * roster.
 */
export async function ensureTournamentOpponentTeam(
  db: SupabaseClient,
  params: { teamId: string; opponentName: string; userId: string },
): Promise<{ opponentTeamId: string } | { error: string }> {
  const normalizedName = params.opponentName.trim().toLowerCase();

  const { data: existingTeams, error: lookupError } = await db
    .from('opponent_teams')
    .select('id, name')
    .eq('team_id', params.teamId);
  if (lookupError) {
    console.error(`[tournament-opponent] lookup failed team=${params.teamId}: ${lookupError.message}`);
    return { error: `Failed to look up opponent team: ${lookupError.message}` };
  }

  const match = (existingTeams ?? []).find(
    (row) => (row.name as string).trim().toLowerCase() === normalizedName,
  );
  if (match) return { opponentTeamId: match.id as string };

  const { data: created, error: insertError } = await db
    .from('opponent_teams')
    .insert({ team_id: params.teamId, name: params.opponentName.trim(), created_by: params.userId })
    .select('id')
    .single();
  if (insertError || !created) {
    console.error(`[tournament-opponent] create failed team=${params.teamId}: ${insertError?.message}`);
    return { error: `Failed to create opponent team: ${insertError?.message ?? 'unknown error'}` };
  }
  return { opponentTeamId: created.id as string };
}
