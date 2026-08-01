import type { SupabaseClient } from '@supabase/supabase-js';
import {
  battingStatsFromCounts,
  pitchingStatsFromCounts,
  fieldingStatsFromCounts,
  type BattingStats,
  type PitchingStats,
  type FieldingStats,
  type BattingCounts,
  type PitchingCounts,
  type FieldingCounts,
} from '@baseball/shared';

// The historical import tables are not yet in the generated Database type.
// After running gen-types these can switch to TypedSupabaseClient.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export type ImportBatchRow = {
  id: string;
  league_id: string;
  source_platform: string;
  file_name: string;
  status: string;
  detected_categories: string[];
  confirmed_categories: string[];
  counts: Record<string, unknown>;
  error_log: unknown[];
  created_by: string | null;
  created_at: string;
  committed_at: string | null;
};

/** Raw historical_player_game_stats row (snake_case from Postgres). */
interface RawPlayerStatRow {
  player_id: string | null;
  player_name: string;
  season_year: number;
  season_label: string | null;
  team_id: string | null;
  opponent_team_id: string | null;
  bat_pa: number | null; bat_ab: number | null; bat_r: number | null; bat_h: number | null;
  bat_2b: number | null; bat_3b: number | null; bat_hr: number | null; bat_rbi: number | null;
  bat_bb: number | null; bat_so: number | null; bat_hbp: number | null; bat_sf: number | null; bat_sh: number | null;
  pit_ip_outs: number | null; pit_pitches: number | null; pit_strikes: number | null; pit_balls: number | null;
  pit_h: number | null; pit_r: number | null; pit_er: number | null; pit_bb: number | null; pit_so: number | null;
  pit_hbp: number | null; pit_wp: number | null;
  fld_po: number | null; fld_a: number | null; fld_e: number | null;
}

export interface ImportedPlayerSeasonStats {
  /** Stable group key: player id, or "name:<name>" when unreconciled. */
  key: string;
  playerId: string | null;
  playerName: string;
  seasonYear: number;
  seasonLabel: string | null;
  source: 'imported';
  batting: BattingStats | null;
  pitching: PitchingStats | null;
  fielding: FieldingStats | null;
}

function toBattingCounts(r: RawPlayerStatRow): BattingCounts {
  return {
    pa: r.bat_pa ?? 0, ab: r.bat_ab ?? 0, r: r.bat_r ?? 0, h: r.bat_h ?? 0,
    '2b': r.bat_2b ?? 0, '3b': r.bat_3b ?? 0, hr: r.bat_hr ?? 0, rbi: r.bat_rbi ?? 0,
    bb: r.bat_bb ?? 0, so: r.bat_so ?? 0, hbp: r.bat_hbp ?? 0, sf: r.bat_sf ?? 0, sh: r.bat_sh ?? 0,
  };
}
function toPitchingCounts(r: RawPlayerStatRow): PitchingCounts {
  return {
    ipOuts: r.pit_ip_outs ?? 0, pitches: r.pit_pitches ?? 0, strikes: r.pit_strikes ?? 0, balls: r.pit_balls ?? 0,
    h: r.pit_h ?? 0, r: r.pit_r ?? 0, er: r.pit_er ?? 0, bb: r.pit_bb ?? 0, so: r.pit_so ?? 0,
    hbp: r.pit_hbp ?? 0, wp: r.pit_wp ?? 0,
  };
}
function toFieldingCounts(r: RawPlayerStatRow): FieldingCounts {
  return { po: r.fld_po ?? 0, a: r.fld_a ?? 0, e: r.fld_e ?? 0 };
}

const hasBatting = (c: BattingCounts) => (c.pa ?? 0) > 0 || (c.ab ?? 0) > 0;
const hasPitching = (c: PitchingCounts) => (c.ipOuts ?? 0) > 0 || (c.pitches ?? 0) > 0;
const hasFielding = (c: FieldingCounts) =>
  (c.po ?? 0) > 0 || (c.a ?? 0) > 0 || (c.e ?? 0) > 0;

/** List a league's import batches, newest first. */
export async function getImportBatches(
  supabase: AnyClient,
  leagueId: string,
): Promise<ImportBatchRow[]> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ImportBatchRow[];
}

/**
 * Imported per-player stats grouped by player + season, with each group's
 * counting rows summed into the standard BattingStats/PitchingStats/
 * FieldingStats shapes (rate stats derived via the shared formulas). The stats
 * UI can render these beside live event-derived stats, badged "imported".
 */
export async function getImportedPlayerStats(
  supabase: AnyClient,
  leagueId: string | null,
  opts: { playerId?: string; playerIds?: string[]; seasonYear?: number } = {},
): Promise<ImportedPlayerSeasonStats[]> {
  let query = supabase
    .from('historical_player_game_stats')
    .select('*');
  if (leagueId) query = query.eq('league_id', leagueId);
  if (opts.playerId) query = query.eq('player_id', opts.playerId);
  if (opts.playerIds?.length) query = query.in('player_id', opts.playerIds);
  if (opts.seasonYear != null) query = query.eq('season_year', opts.seasonYear);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as RawPlayerStatRow[];

  // Group by player (or name when unreconciled) + season.
  const groups = new Map<string, RawPlayerStatRow[]>();
  for (const row of rows) {
    const id = row.player_id ?? `name:${row.player_name}`;
    const key = `${id}|${row.season_year}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const result: ImportedPlayerSeasonStats[] = [];
  for (const [key, groupRows] of groups) {
    const first = groupRows[0];
    const playerKey = first.player_id ?? `name:${first.player_name}`;
    const batting = groupRows.map(toBattingCounts);
    const pitching = groupRows.map(toPitchingCounts);
    const fielding = groupRows.map(toFieldingCounts);
    const games = groupRows.length;

    result.push({
      key,
      playerId: first.player_id,
      playerName: first.player_name,
      seasonYear: first.season_year,
      seasonLabel: first.season_label,
      source: 'imported',
      batting: batting.some(hasBatting)
        ? battingStatsFromCounts(playerKey, first.player_name, games, batting)
        : null,
      pitching: pitching.some(hasPitching)
        ? pitchingStatsFromCounts(playerKey, first.player_name, games, pitching)
        : null,
      fielding: fielding.some(hasFielding)
        ? fieldingStatsFromCounts(playerKey, first.player_name, games, fielding)
        : null,
    });
  }
  return result;
}
