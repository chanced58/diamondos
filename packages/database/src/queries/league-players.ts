import type { SupabaseClient } from '@supabase/supabase-js';

export type LeaguePlayerRow = {
  player_id: string;
  league_id: string;
  registered_at: string;
  registered_by: string | null;
  notes: string | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
    primary_position: string | null;
    bats: string | null;
    throws: string | null;
    date_of_birth: string | null;
    graduation_year: number | null;
    is_guest_only: boolean;
    team_id: string | null;
    team: { id: string; name: string; organization: string | null } | null;
  };
};

/**
 * All players registered in the league, with their current team (if any).
 * Excludes guest-only identities unless includeGuests is set.
 */
export async function getLeaguePlayers(
  db: SupabaseClient,
  leagueId: string,
  opts: { includeGuests?: boolean } = {},
): Promise<LeaguePlayerRow[]> {
  let q = db
    .from('league_players')
    .select(`
      player_id, league_id, registered_at, registered_by, notes,
      player:players!inner(
        id, first_name, last_name, jersey_number, primary_position, bats, throws,
        date_of_birth, graduation_year, is_guest_only, team_id,
        team:teams(id, name, organization)
      )
    `)
    .eq('league_id', leagueId);

  if (!opts.includeGuests) {
    q = q.eq('player.is_guest_only', false);
  }

  const { data, error } = await q.order('last_name', { referencedTable: 'players' });
  if (error) throw error;
  return (data ?? []) as unknown as LeaguePlayerRow[];
}

export type PlayerTransferRow = {
  id: string;
  league_id: string | null;
  player_id: string;
  from_team_id: string | null;
  to_team_id: string | null;
  season_id: string | null;
  transferred_at: string;
  initiated_by: string;
  reason: string | null;
  notes: string | null;
  transfer_type: 'initial_assignment' | 'trade' | 'release' | 'reassignment' | null;
  from_team: { id: string; name: string } | null;
  to_team: { id: string; name: string } | null;
};

/**
 * All transfer rows for a player, newest first. Includes both league-scoped
 * (league_id set) and legacy coach-driven (league_id NULL) entries.
 */
export async function getPlayerTransfers(
  db: SupabaseClient,
  playerId: string,
): Promise<PlayerTransferRow[]> {
  const { data, error } = await db
    .from('player_transfers')
    .select(`
      id, league_id, player_id, from_team_id, to_team_id, season_id,
      transferred_at, initiated_by, reason, notes, transfer_type,
      from_team:teams!player_transfers_from_team_id_fkey(id, name),
      to_team:teams!player_transfers_to_team_id_fkey(id, name)
    `)
    .eq('player_id', playerId)
    .order('transferred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PlayerTransferRow[];
}
