/**
 * GameChanger "Home Team" import adapter.
 *
 * The first concrete adapter. It classifies each uploaded CSV/XML file into a
 * category by its header signature, then normalizes rows through an
 * admin-editable column mapping (seeded from `fieldAliases`). Because the
 * confirmation UI lets the admin correct the mapping, auto-detection only needs
 * to be a good starting point — not perfect.
 *
 * NOTE: finalize the alias tables against a real Home Team export dropped into
 * __fixtures__/ (tracked as the plan's open item). Pitching files that reuse
 * batting-style headers (H, R, BB, SO) may need manual remapping in the UI;
 * batting aliases win those collisions by default.
 */
import type {
  HistoricalImportAdapter,
  HistoricalImportFile,
  HistoricalCategory,
  ColumnMapping,
  FieldAliases,
  ParsedSource,
  NormalizedRosterRow,
  NormalizedPlayerGameStatRow,
  NormalizedTeamGameStatRow,
  BattingCounts,
  PitchingCounts,
  FieldingCounts,
} from './types';
import { applyMapping, normalizeHeader } from './mapping-engine';
import { parseName } from './player-matching';
import { parseCSV, csvHeaders, detectFileKind } from './parse';

const FIELD_ALIASES: FieldAliases = {
  rosters: {
    externalPlayerId: ['playerid', 'id'],
    firstName: ['first', 'firstname'],
    lastName: ['last', 'lastname'],
    fullName: ['name', 'player', 'playername'],
    jerseyNumber: ['number', 'jersey', 'uni', 'no'],
    primaryPosition: ['position', 'pos', 'primaryposition'],
    bats: ['bats', 'b'],
    throws: ['throws', 't'],
    dateOfBirth: ['dob', 'birthdate', 'birthday', 'dateofbirth'],
    graduationYear: ['gradyear', 'graduationyear', 'class'],
  },
  player_stats: {
    externalPlayerId: ['playerid', 'id'],
    fullName: ['name', 'player', 'playername'],
    firstName: ['first', 'firstname'],
    lastName: ['last', 'lastname'],
    jerseyNumber: ['number', 'jersey', 'uni', 'no'],
    externalGameId: ['gameid'],
    gameDate: ['date', 'gamedate'],
    opponentLabel: ['opponent', 'opp', 'vs'],
    gamesPlayed: ['gp', 'g', 'gamesplayed'],
    bat_pa: ['pa', 'plateappearances'],
    bat_ab: ['ab', 'atbats'],
    bat_r: ['r', 'runs'],
    bat_h: ['h', 'hits'],
    bat_2b: ['2b', 'doubles'],
    bat_3b: ['3b', 'triples'],
    bat_hr: ['hr', 'homeruns'],
    bat_rbi: ['rbi', 'rbis'],
    bat_bb: ['bb', 'walks'],
    bat_so: ['so', 'k', 'strikeouts'],
    bat_hbp: ['hbp'],
    bat_sf: ['sf', 'sacfly', 'sacrificeflies'],
    bat_sh: ['sh', 'sac', 'sacbunt', 'sacrificehits'],
    pit_ip: ['ip', 'inningspitched'],
    pit_pitches: ['pitches', 'np', 'numpitches'],
    pit_strikes: ['strikes'],
    pit_balls: ['balls'],
    pit_h: ['ha', 'hitsallowed'],
    pit_r: ['ra', 'runsallowed'],
    pit_er: ['er', 'earnedruns'],
    pit_bb: ['bba', 'walksallowed'],
    pit_so: ['ka', 'kp', 'strikeoutspitching'],
    pit_hbp: ['hbpp', 'hitbatters'],
    pit_wp: ['wp', 'wildpitches'],
    fld_po: ['po', 'putouts'],
    fld_a: ['a', 'assists'],
    fld_e: ['e', 'errors'],
  },
  team_stats: {
    externalGameId: ['gameid'],
    teamName: ['team', 'teamname', 'name'],
    gameDate: ['date', 'gamedate'],
    opponentLabel: ['opponent', 'opp', 'vs'],
    gamesPlayed: ['gp', 'g', 'gamesplayed'],
    wins: ['w', 'wins'],
    losses: ['l', 'losses'],
    ties: ['t', 'ties'],
    runsFor: ['rf', 'runsfor', 'rs', 'runsscored'],
    runsAgainst: ['ra', 'runsagainst'],
  },
};

const BATTING_KEYS: (keyof BattingCounts)[] = [
  'pa', 'ab', 'r', 'h', '2b', '3b', 'hr', 'rbi', 'bb', 'so', 'hbp', 'sf', 'sh',
];
const PITCHING_KEYS: (keyof PitchingCounts)[] = [
  'pitches', 'strikes', 'balls', 'h', 'r', 'er', 'bb', 'so', 'hbp', 'wp',
];
const FIELDING_KEYS: (keyof FieldingCounts)[] = ['po', 'a', 'e'];

function coerceInt(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Convert an innings-pitched decimal ("5.2" = 5⅔ innings) to outs recorded. */
export function ipToOuts(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return undefined;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 10); // .1 → 1 out, .2 → 2 outs
  return whole * 3 + (frac === 1 ? 1 : frac === 2 ? 2 : 0);
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // M/D/YYYY or MM/DD/YYYY
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mm, dd, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return null;
}

function headerSet(columns: string[]): Set<string> {
  return new Set(columns.map(normalizeHeader));
}

function classifyFile(columns: string[]): HistoricalCategory[] {
  const h = headerSet(columns);
  const hasBatting = h.has('ab') || h.has('pa');
  const hasPitching = h.has('ip') || h.has('era') || h.has('er');
  const hasName = h.has('name') || h.has('last') || h.has('lastname') || h.has('player');
  const hasTeam = h.has('team') || h.has('teamname');
  const hasRecord = (h.has('w') && h.has('l')) || h.has('wins');

  if (hasBatting || hasPitching) {
    // A player stats file also carries roster identity columns.
    return hasName ? ['player_stats', 'rosters'] : ['player_stats'];
  }
  if (hasTeam && hasRecord) return ['team_stats'];
  if (hasName) return ['rosters'];
  return [];
}

export const homeTeamAdapter: HistoricalImportAdapter = {
  platform: 'home_team',
  fieldAliases: FIELD_ALIASES,

  detectAndParse(files: HistoricalImportFile[]): ParsedSource {
    const detected = new Set<HistoricalCategory>();
    const columnsByCategory: ParsedSource['columnsByCategory'] = {};
    const rawRows: ParsedSource['rawRows'] = {};

    for (const file of files) {
      const kind = detectFileKind(file.name, file.bytes);
      // v1 row-level parsing is CSV-based; XML support for box scores is a
      // follow-up. Skip XML files here rather than misclassify them.
      if (kind !== 'csv') continue;

      const columns = csvHeaders(file.bytes);
      const categories = classifyFile(columns);
      if (categories.length === 0) continue;

      const rows = parseCSV(file.bytes);
      for (const category of categories) {
        detected.add(category);
        columnsByCategory[category] = columns;
        rawRows[category] = (rawRows[category] ?? []).concat(rows);
      }
    }

    return {
      detectedCategories: Array.from(detected),
      columnsByCategory,
      rawRows,
    };
  },

  normalizeRoster(row: Record<string, string>, mapping: ColumnMapping): NormalizedRosterRow | null {
    const m = applyMapping(row, mapping);
    let firstName = m.firstName ?? '';
    let lastName = m.lastName ?? '';
    if ((!firstName || !lastName) && m.fullName) {
      const parts = m.fullName.includes(',')
        ? m.fullName.split(',').map((s) => s.trim())
        : null;
      if (parts) {
        lastName = lastName || parts[0] || '';
        firstName = firstName || parts[1] || '';
      } else {
        const tokens = m.fullName.trim().split(/\s+/);
        firstName = firstName || tokens[0] || '';
        lastName = lastName || tokens.slice(1).join(' ') || '';
      }
    }
    if (!firstName && !lastName) return null;

    return {
      externalPlayerId: m.externalPlayerId ?? null,
      firstName,
      lastName,
      jerseyNumber: coerceInt(m.jerseyNumber) ?? null,
      primaryPosition: m.primaryPosition ?? null,
      bats: m.bats ?? null,
      throws: m.throws ?? null,
      dateOfBirth: normalizeDate(m.dateOfBirth),
      graduationYear: coerceInt(m.graduationYear) ?? null,
    };
  },

  normalizePlayerStat(
    row: Record<string, string>,
    mapping: ColumnMapping,
    seasonContext: { seasonYear: number; seasonLabel: string | null },
  ): NormalizedPlayerGameStatRow | null {
    const m = applyMapping(row, mapping);

    // Derive a canonical "First Last" name IDENTICALLY to the match-preview
    // path (actions.buildMatchPreview), so the synthetic external id used to
    // link stat rows to reconciled players matches. A raw "Last, First"
    // fullName must be reordered here too, or the link silently fails.
    let firstName = m.firstName ?? '';
    let lastName = m.lastName ?? '';
    if ((!firstName || !lastName) && m.fullName) {
      const parsed = parseName(m.fullName);
      firstName = firstName || parsed.first;
      lastName = lastName || parsed.last;
    }
    const playerName = `${firstName} ${lastName}`.trim() || (m.fullName ?? '').trim();
    if (!playerName) return null;

    const batting: BattingCounts = {};
    for (const key of BATTING_KEYS) {
      const v = coerceInt(m[`bat_${key}`]);
      if (v !== undefined) batting[key] = v;
    }
    const pitching: PitchingCounts = {};
    const ipOuts = ipToOuts(m.pit_ip);
    if (ipOuts !== undefined) pitching.ipOuts = ipOuts;
    for (const key of PITCHING_KEYS) {
      const v = coerceInt(m[`pit_${key}`]);
      if (v !== undefined) pitching[key] = v;
    }
    const fielding: FieldingCounts = {};
    for (const key of FIELDING_KEYS) {
      const v = coerceInt(m[`fld_${key}`]);
      if (v !== undefined) fielding[key] = v;
    }

    const gameDate = normalizeDate(m.gameDate);
    const externalGameId = m.externalGameId ?? null;
    const isSeasonSummary = !gameDate && !externalGameId;

    const result: NormalizedPlayerGameStatRow = {
      externalPlayerId: m.externalPlayerId ?? null,
      externalGameId,
      playerName,
      jerseyNumber: coerceInt(m.jerseyNumber) ?? null,
      seasonYear: seasonContext.seasonYear,
      seasonLabel: seasonContext.seasonLabel,
      gameDate,
      opponentLabel: m.opponentLabel ?? null,
      isSeasonSummary,
      gamesPlayed: coerceInt(m.gamesPlayed) ?? 1,
    };
    if (Object.keys(batting).length > 0) result.batting = batting;
    if (Object.keys(pitching).length > 0) result.pitching = pitching;
    if (Object.keys(fielding).length > 0) result.fielding = fielding;
    return result;
  },

  normalizeTeamStat(
    row: Record<string, string>,
    mapping: ColumnMapping,
    seasonContext: { seasonYear: number; seasonLabel: string | null },
  ): NormalizedTeamGameStatRow | null {
    const m = applyMapping(row, mapping);
    const teamName = m.teamName ?? '';
    if (!teamName) return null;

    const gameDate = normalizeDate(m.gameDate);
    const externalGameId = m.externalGameId ?? null;

    const row2: NormalizedTeamGameStatRow = {
      externalGameId,
      teamName,
      seasonYear: seasonContext.seasonYear,
      seasonLabel: seasonContext.seasonLabel,
      gameDate,
      opponentLabel: m.opponentLabel ?? null,
      isSeasonSummary: !gameDate && !externalGameId,
      gamesPlayed: coerceInt(m.gamesPlayed) ?? 1,
    };
    const wins = coerceInt(m.wins);
    const losses = coerceInt(m.losses);
    const ties = coerceInt(m.ties);
    const runsFor = coerceInt(m.runsFor);
    const runsAgainst = coerceInt(m.runsAgainst);
    if (wins !== undefined) row2.wins = wins;
    if (losses !== undefined) row2.losses = losses;
    if (ties !== undefined) row2.ties = ties;
    if (runsFor !== undefined) row2.runsFor = runsFor;
    if (runsAgainst !== undefined) row2.runsAgainst = runsAgainst;
    return row2;
  },
};
