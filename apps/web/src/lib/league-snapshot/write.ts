import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PlayerSnapshotRow,
  SpotlightSnapshotRow,
  StandingSnapshotRow,
  TeamStatSnapshotRow,
} from './aggregate';

/** Every row of one league-season's snapshot. */
export interface LeagueSeasonSnapshot {
  players: PlayerSnapshotRow[];
  standings: StandingSnapshotRow[];
  teamStats: TeamStatSnapshotRow[];
  spotlights: SpotlightSnapshotRow[];
}

const SNAPSHOT_TABLES = [
  'league_player_stat_snapshot',
  'league_standings_snapshot',
  'league_team_stat_snapshot',
  'league_spotlight_snapshot',
] as const;

function assertWritten(error: { message: string } | null, what: string, leagueId: string, season: string): void {
  if (error) throw new Error(`snapshot ${what} failed (league=${leagueId} season=${season}): ${error.message}`);
}

/** Remove all snapshot rows for one league-season. Throws on any failed delete. */
export async function clearLeagueSeasonSnapshots(db: SupabaseClient, leagueId: string, season: string): Promise<void> {
  for (const table of SNAPSHOT_TABLES) {
    const { error } = await db.from(table).delete().eq('league_id', leagueId).eq('season', season);
    assertWritten(error, `${table} delete`, leagueId, season);
  }
}

/**
 * Replace one league-season's snapshot rows. Every delete and insert is
 * checked: a failure throws with the league and season instead of leaving
 * the public page silently empty.
 *
 * Not a single transaction (supabase-js limitation) — a mid-write failure is
 * healed by the next finalize/cron recompute. A transactional RPC or staged
 * version-swap is tracked as a v2 hardening item.
 */
export async function replaceLeagueSeasonSnapshot(
  db: SupabaseClient,
  leagueId: string,
  season: string,
  snapshot: LeagueSeasonSnapshot,
): Promise<void> {
  await clearLeagueSeasonSnapshots(db, leagueId, season);
  const inserts: [table: (typeof SNAPSHOT_TABLES)[number], rows: unknown[]][] = [
    ['league_player_stat_snapshot', snapshot.players],
    ['league_standings_snapshot', snapshot.standings],
    ['league_team_stat_snapshot', snapshot.teamStats],
    ['league_spotlight_snapshot', snapshot.spotlights],
  ];
  for (const [table, rows] of inserts) {
    if (rows.length === 0) continue;
    const { error } = await db.from(table).insert(rows);
    assertWritten(error, `${table} insert`, leagueId, season);
  }
}
