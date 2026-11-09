import type { SupabaseClient } from '@supabase/supabase-js';

interface StartingGame {
  team_id: string;
  opponent_name: string | null;
  opponent_team_id: string | null;
  league_game_id?: string | null;
}

/**
 * Gives a normal game with no opponent batting order a default one when it
 * starts, so a coach can score without entering the opponent first: the
 * opponent team is created if missing, padded to 15 "Player N" rows, and its
 * first nine bat in order. Default players can be edited during or after the
 * game.
 *
 * Never on a league game, nor against a league roster record: that roster is
 * the league's mirror of a real team, so it gets no "Player N" rows and no
 * order built from its real players. Such a game starts with no opponent
 * order; the scorer records the opponent untracked or adds batters (unknown
 * players of the league game) at the field.
 *
 * Returns an error message, or null when there was nothing to do or it worked.
 */
export async function ensureDefaultOpponentLineup(
  supabase: SupabaseClient,
  { gameId, game, userId }: { gameId: string; game: StartingGame; userId: string },
): Promise<string | null> {
  if (game.league_game_id) return null;

  const { count: oppLineupCount } = await supabase
    .from('opponent_game_lineups')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId);
  if (oppLineupCount && oppLineupCount > 0) return null;

  let opponentTeamId = game.opponent_team_id;

  if (opponentTeamId) {
    const { data: team, error: teamReadErr } = await supabase
      .from('opponent_teams')
      .select('league_id, linked_team_id')
      .eq('id', opponentTeamId)
      .maybeSingle();
    if (teamReadErr) return `Failed to load the opponent team: ${teamReadErr.message}`;
    if (team?.league_id && team?.linked_team_id) return null;
  }

  // Create opponent team if it doesn't exist
  if (!opponentTeamId) {
    const { data: newTeam, error: teamErr } = await supabase
      .from('opponent_teams')
      .insert({ team_id: game.team_id, name: game.opponent_name, created_by: userId })
      .select('id')
      .single();
    if (teamErr || !newTeam) return `Failed to create opponent team: ${teamErr?.message}`;

    const { error: linkErr } = await supabase
      .from('games')
      .update({ opponent_team_id: newTeam.id })
      .eq('id', gameId);
    if (linkErr) {
      // Rollback: remove the orphaned opponent team
      await supabase.from('opponent_teams').delete().eq('id', newTeam.id);
      return `Failed to link opponent team to game: ${linkErr.message}`;
    }
    opponentTeamId = newTeam.id as string;
  }

  // Check if the team already has players
  const { data: existingPlayers } = await supabase
    .from('opponent_players')
    .select('id')
    .eq('opponent_team_id', opponentTeamId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  let playerIds: string[] = ((existingPlayers ?? []) as { id: string }[]).map((p) => p.id);

  // Backfill to 15 default players if fewer exist
  const needed = 15 - playerIds.length;
  if (needed > 0) {
    const startIdx = playerIds.length + 1;
    const defaultPlayers = Array.from({ length: needed }, (_, i) => ({
      opponent_team_id: opponentTeamId!,
      first_name: 'Player',
      last_name: String(startIdx + i),
    }));
    const { data: inserted, error: playersErr } = await supabase
      .from('opponent_players')
      .insert(defaultPlayers)
      .select('id');
    if (playersErr || !inserted) return `Failed to create default opponent players: ${playersErr?.message}`;
    playerIds = [...playerIds, ...(inserted as { id: string }[]).map((p) => p.id)];
  }

  // Create lineup entries for up to 9 players
  const lineupEntries = playerIds.slice(0, 9).map((id, i) => ({
    game_id: gameId,
    opponent_player_id: id,
    batting_order: i + 1,
    is_starter: true,
    starting_position: i === 0 ? 'pitcher' : null,
  }));
  const { error: lineupErr } = await supabase.from('opponent_game_lineups').insert(lineupEntries);
  if (lineupErr) return `Failed to create default opponent lineup: ${lineupErr.message}`;
  return null;
}
