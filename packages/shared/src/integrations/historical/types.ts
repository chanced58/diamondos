/**
 * League historical-data import — adapter + normalized-row contract.
 *
 * A separate contract from the training-session `IntegrationAdapter` (this
 * imports rosters + box scores into the league's history, not training rows).
 * Adapters are PURE — no network, no DB — so they run in the browser for the
 * preview step, in the edge function for large files, and in unit tests.
 *
 * The first adapter targets GameChanger "Home Team". A generic mapping engine
 * (mapping-engine.ts) sits underneath: the confirmation UI edits a
 * source-column → internal-field map, so a new platform only needs a new
 * adapter + `defaultMapping`.
 */

export type HistoricalImportPlatform = 'home_team';

export type HistoricalCategory = 'rosters' | 'player_stats' | 'team_stats';

export const HISTORICAL_CATEGORIES: readonly HistoricalCategory[] = [
  'rosters',
  'player_stats',
  'team_stats',
];

/** A source-column → internal-field map for one category. */
export type ColumnMapping = Record<string, string>;

/** Per-category column mappings. */
export type CategoryMappings = Partial<Record<HistoricalCategory, ColumnMapping>>;

/** Output of parsing the uploaded file(s): the raw rows + headers per category. */
export interface ParsedSource {
  detectedCategories: HistoricalCategory[];
  /** Header columns per detected category, for the mapping UI. */
  columnsByCategory: Partial<Record<HistoricalCategory, string[]>>;
  /** Raw string rows per detected category. */
  rawRows: Partial<Record<HistoricalCategory, Record<string, string>[]>>;
}

export interface NormalizedRosterRow {
  externalPlayerId: string | null;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  primaryPosition: string | null;
  bats: string | null;
  throws: string | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  graduationYear: number | null;
}

export interface BattingCounts {
  pa?: number; ab?: number; r?: number; h?: number;
  '2b'?: number; '3b'?: number; hr?: number; rbi?: number;
  bb?: number; so?: number; hbp?: number; sf?: number; sh?: number;
}

export interface PitchingCounts {
  ipOuts?: number; pitches?: number; strikes?: number; balls?: number;
  h?: number; r?: number; er?: number; bb?: number; so?: number;
  hbp?: number; wp?: number;
}

export interface FieldingCounts {
  po?: number; a?: number; e?: number;
}

export interface NormalizedPlayerGameStatRow {
  externalPlayerId: string | null;
  externalGameId: string | null;
  playerName: string;
  jerseyNumber: number | null;
  seasonYear: number;
  seasonLabel: string | null;
  gameDate: string | null; // YYYY-MM-DD; null for season-summary rows
  opponentLabel: string | null;
  isSeasonSummary: boolean;
  gamesPlayed: number;
  batting?: BattingCounts;
  pitching?: PitchingCounts;
  fielding?: FieldingCounts;
}

export interface NormalizedTeamGameStatRow {
  externalGameId: string | null;
  teamName: string;
  seasonYear: number;
  seasonLabel: string | null;
  gameDate: string | null;
  opponentLabel: string | null;
  isSeasonSummary: boolean;
  gamesPlayed: number;
  wins?: number;
  losses?: number;
  ties?: number;
  runsFor?: number;
  runsAgainst?: number;
  teamStats?: Record<string, number>;
}

export interface HistoricalImportFile {
  name: string;
  bytes: Uint8Array | string;
}

/**
 * Pure adapter for one source platform.
 *
 *   files → detectAndParse() → ParsedSource
 *         → (admin confirms category mapping)
 *         → normalize{Roster,PlayerStat,TeamStat}(rawRow, mapping) → normalized row
 */
/** internalField → accepted source-header aliases, per category. Aliases are
 *  matched loosely (case/punctuation-insensitive) against actual file headers
 *  to propose a starting mapping the admin can then correct. */
export type FieldAliases = Partial<Record<HistoricalCategory, Record<string, string[]>>>;

export interface HistoricalImportAdapter {
  readonly platform: HistoricalImportPlatform;
  /** Alias table used to auto-propose the source-column → internal-field map. */
  readonly fieldAliases: FieldAliases;
  detectAndParse(files: HistoricalImportFile[]): ParsedSource;
  normalizeRoster(row: Record<string, string>, mapping: ColumnMapping): NormalizedRosterRow | null;
  normalizePlayerStat(
    row: Record<string, string>,
    mapping: ColumnMapping,
    seasonContext: { seasonYear: number; seasonLabel: string | null },
  ): NormalizedPlayerGameStatRow | null;
  normalizeTeamStat(
    row: Record<string, string>,
    mapping: ColumnMapping,
    seasonContext: { seasonYear: number; seasonLabel: string | null },
  ): NormalizedTeamGameStatRow | null;
}
