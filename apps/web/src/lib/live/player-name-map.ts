import type { TypedSupabaseClient } from '@baseball/database';

export type PlayerName = {
  lastName: string;
  jerseyNumber: string | number | null;
};

export type PlayerNameMap = Record<string, PlayerName>;

export async function buildLivePlayerNameMap(
  db: TypedSupabaseClient,
  teamIds: string[],
  opponentTeamIds: string[],
): Promise<PlayerNameMap> {
  const map: PlayerNameMap = {};
  if (teamIds.length === 0 && opponentTeamIds.length === 0) return map;

  const [teamPlayersRes, opponentPlayersRes] = await Promise.all([
    teamIds.length > 0
      ? db.from('players').select('id, last_name, jersey_number').in('team_id', teamIds)
      : Promise.resolve({ data: [] as Array<{ id: string; last_name: string; jersey_number: number | null }> }),
    opponentTeamIds.length > 0
      ? db
          .from('opponent_players')
          .select('id, last_name, jersey_number')
          .in('opponent_team_id', opponentTeamIds)
      : Promise.resolve({ data: [] as Array<{ id: string; last_name: string; jersey_number: string | null }> }),
  ]);

  for (const p of (teamPlayersRes.data ?? []) as Array<{
    id: string;
    last_name: string;
    jersey_number: number | null;
  }>) {
    map[p.id] = { lastName: p.last_name, jerseyNumber: p.jersey_number };
  }
  for (const p of (opponentPlayersRes.data ?? []) as Array<{
    id: string;
    last_name: string;
    jersey_number: string | null;
  }>) {
    map[p.id] = { lastName: p.last_name, jerseyNumber: p.jersey_number };
  }
  return map;
}

export function formatPlayer(map: PlayerNameMap, id: string | null | undefined): string {
  if (!id) return '—';
  const p = map[id];
  if (!p) return '—';
  const jersey = p.jerseyNumber != null ? `#${p.jerseyNumber} ` : '';
  return `${jersey}${p.lastName}`;
}
