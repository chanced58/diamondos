/**
 * Home Team (GameChanger) export builders — the inverse of `homeTeamAdapter`.
 *
 * Coaches export a single completed game's stats as CSV files whose headers
 * match the columns the import adapter already recognizes, so the export
 * round-trips back through the importer. Pure (no I/O), so it runs in an edge
 * function, a Next.js route, or a unit test.
 *
 * Batting and pitching deliberately use DISTINCT headers (H vs HA, R vs RA,
 * BB vs BBA, SO vs KA, HBP vs HBPP) so the import auto-mapper assigns each to
 * the correct internal field — the adapter warns these collide otherwise.
 */
import type { BattingStats } from '../../types/batting';
import type { PitchingStats } from '../../types/pitching';
import { formatInningsPitched } from '../../utils/pitching-stats';

export interface HomeTeamFieldingLine {
  putouts: number;
  assists: number;
  errors: number;
}

export interface HomeTeamPlayerExportRow {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  batting?: BattingStats | null;
  pitching?: PitchingStats | null;
  fielding?: HomeTeamFieldingLine | null;
}

export interface HomeTeamGameMeta {
  /** Game date as YYYY-MM-DD, or null if unknown. */
  date: string | null;
  opponent: string;
}

export interface HomeTeamTeamExportRow {
  teamName: string;
  date: string | null;
  opponent: string;
  wins: number;
  losses: number;
  ties: number;
  runsFor: number;
  runsAgainst: number;
}

/** Quote a CSV field when it contains a comma, quote, or newline (RFC 4180). */
function csvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: (string | number | null | undefined)[]): string {
  return values.map(csvField).join(',');
}

/** Blank when undefined, so the importer's coerceInt treats it as absent. */
function num(value: number | undefined): string {
  return value == null ? '' : String(value);
}

const PLAYER_HEADERS = [
  'PlayerID', 'Number', 'Last', 'First', 'Date', 'Opponent', 'GP',
  // Batting
  'PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO', 'HBP', 'SF', 'SH',
  // Pitching
  'IP', 'NP', 'Strikes', 'Balls', 'HA', 'RA', 'ER', 'BBA', 'KA', 'HBPP', 'WP',
  // Fielding
  'PO', 'A', 'E',
];

const TEAM_HEADERS = ['Team', 'Date', 'Opponent', 'GP', 'W', 'L', 'T', 'RF', 'RA'];

/**
 * Build the player-stats CSV: one row per player, carrying their batting,
 * pitching, and fielding lines for this single game (GP = 1).
 */
export function toHomeTeamPlayerStatsCsv(
  rows: HomeTeamPlayerExportRow[],
  meta: HomeTeamGameMeta,
): string {
  const lines = [csvRow(PLAYER_HEADERS)];

  for (const r of rows) {
    const b = r.batting ?? undefined;
    const p = r.pitching ?? undefined;
    const f = r.fielding ?? undefined;

    lines.push(
      csvRow([
        r.playerId,
        r.jerseyNumber ?? '',
        r.lastName,
        r.firstName,
        meta.date,
        meta.opponent,
        1, // GP
        // Batting
        num(b?.plateAppearances),
        num(b?.atBats),
        num(b?.runs),
        num(b?.hits),
        num(b?.doubles),
        num(b?.triples),
        num(b?.homeRuns),
        num(b?.rbi),
        num(b?.walks),
        num(b?.strikeouts),
        num(b?.hitByPitch),
        num(b?.sacrificeFlies),
        num(b?.sacrificeHits),
        // Pitching
        p ? formatInningsPitched(p.inningsPitchedOuts) : '',
        num(p?.totalPitches),
        num(p?.strikes),
        num(p?.balls),
        num(p?.hitsAllowed),
        num(p?.runsAllowed),
        num(p?.earnedRunsAllowed),
        num(p?.walksAllowed),
        num(p?.strikeouts),
        num(p?.hitBatters),
        num(p?.wildPitches),
        // Fielding
        num(f?.putouts),
        num(f?.assists),
        num(f?.errors),
      ]),
    );
  }

  return lines.join('\n');
}

/** Build the team-stats CSV: one row summarizing this single game (GP = 1). */
export function toHomeTeamTeamStatsCsv(row: HomeTeamTeamExportRow): string {
  return [
    csvRow(TEAM_HEADERS),
    csvRow([
      row.teamName,
      row.date,
      row.opponent,
      1, // GP
      row.wins,
      row.losses,
      row.ties,
      row.runsFor,
      row.runsAgainst,
    ]),
  ].join('\n');
}
