import { homeTeamAdapter, ipToOuts } from '../home-team-adapter';
import { autoDetectMapping } from '../mapping-engine';

const BATTING_CSV = [
  'Number,Last,First,GP,PA,AB,R,H,2B,3B,HR,RBI,BB,SO,HBP,SF,SH',
  '7,Lovelace,Ada,12,40,34,9,14,3,1,2,11,5,6,1,0,0',
  '1,Turing,Alan,11,38,33,7,10,2,0,1,8,4,9,0,1,0',
].join('\n');

const ROSTER_CSV = [
  'Number,Last,First,Position,Bats,Throws,DOB,Grad Year',
  '7,Lovelace,Ada,SS,R,R,2008-12-10,2026',
].join('\n');

const TEAM_CSV = [
  'Team,GP,W,L,T,RF,RA',
  'Wildcats,20,14,6,0,142,98',
].join('\n');

const SEASON = { seasonYear: 2024, seasonLabel: '2024 Spring' };

describe('homeTeamAdapter.detectAndParse', () => {
  it('classifies a batting stats file as player_stats + rosters', () => {
    const parsed = homeTeamAdapter.detectAndParse([
      { name: 'batting.csv', bytes: BATTING_CSV },
    ]);
    expect(parsed.detectedCategories.sort()).toEqual(['player_stats', 'rosters']);
    expect(parsed.rawRows.player_stats).toHaveLength(2);
    expect(parsed.columnsByCategory.player_stats).toContain('PA');
  });

  it('classifies a pure roster file as rosters only', () => {
    const parsed = homeTeamAdapter.detectAndParse([
      { name: 'roster.csv', bytes: ROSTER_CSV },
    ]);
    expect(parsed.detectedCategories).toEqual(['rosters']);
  });

  it('classifies a team record file as team_stats', () => {
    const parsed = homeTeamAdapter.detectAndParse([{ name: 'teams.csv', bytes: TEAM_CSV }]);
    expect(parsed.detectedCategories).toEqual(['team_stats']);
  });
});

describe('homeTeamAdapter.normalizePlayerStat', () => {
  it('maps a batting row to normalized counts with the auto-detected mapping', () => {
    const parsed = homeTeamAdapter.detectAndParse([
      { name: 'batting.csv', bytes: BATTING_CSV },
    ]);
    const mapping = autoDetectMapping(
      parsed.columnsByCategory.player_stats!,
      homeTeamAdapter.fieldAliases.player_stats!,
    );
    const normalized = homeTeamAdapter.normalizePlayerStat(
      parsed.rawRows.player_stats![0],
      mapping,
      SEASON,
    );
    expect(normalized).toMatchObject({
      playerName: 'Ada Lovelace',
      jerseyNumber: 7,
      seasonYear: 2024,
      isSeasonSummary: true,
      gamesPlayed: 12,
      batting: { pa: 40, ab: 34, r: 9, h: 14, '2b': 3, '3b': 1, hr: 2, rbi: 11, bb: 5, so: 6, hbp: 1 },
    });
    expect(normalized?.pitching).toBeUndefined();
  });
});

describe('homeTeamAdapter.normalizeRoster', () => {
  it('maps a roster row including DOB and grad year', () => {
    const parsed = homeTeamAdapter.detectAndParse([
      { name: 'roster.csv', bytes: ROSTER_CSV },
    ]);
    const mapping = autoDetectMapping(
      parsed.columnsByCategory.rosters!,
      homeTeamAdapter.fieldAliases.rosters!,
    );
    const normalized = homeTeamAdapter.normalizeRoster(parsed.rawRows.rosters![0], mapping);
    expect(normalized).toEqual({
      externalPlayerId: null,
      firstName: 'Ada',
      lastName: 'Lovelace',
      jerseyNumber: 7,
      primaryPosition: 'SS',
      bats: 'R',
      throws: 'R',
      dateOfBirth: '2008-12-10',
      graduationYear: 2026,
    });
  });
});

describe('homeTeamAdapter.normalizeTeamStat', () => {
  it('maps a team record row', () => {
    const parsed = homeTeamAdapter.detectAndParse([{ name: 'teams.csv', bytes: TEAM_CSV }]);
    const mapping = autoDetectMapping(
      parsed.columnsByCategory.team_stats!,
      homeTeamAdapter.fieldAliases.team_stats!,
    );
    const normalized = homeTeamAdapter.normalizeTeamStat(
      parsed.rawRows.team_stats![0],
      mapping,
      SEASON,
    );
    expect(normalized).toMatchObject({
      teamName: 'Wildcats',
      wins: 14,
      losses: 6,
      ties: 0,
      runsFor: 142,
      runsAgainst: 98,
      isSeasonSummary: true,
    });
  });
});

describe('normalizePlayerStat name canonicalization', () => {
  // A "Last, First" fullName column must be reordered to "First Last" so the
  // synthetic link id matches the match-preview path (which reparses names).
  const NAME_CSV = ['Name,PA,AB,H', '"Lovelace, Ada",10,9,4'].join('\n');

  it('reorders a "Last, First" name column to First Last', () => {
    const parsed = homeTeamAdapter.detectAndParse([{ name: 'stats.csv', bytes: NAME_CSV }]);
    const mapping = autoDetectMapping(
      parsed.columnsByCategory.player_stats!,
      homeTeamAdapter.fieldAliases.player_stats!,
    );
    const normalized = homeTeamAdapter.normalizePlayerStat(
      parsed.rawRows.player_stats![0],
      mapping,
      SEASON,
    );
    expect(normalized?.playerName).toBe('Ada Lovelace');
  });
});

describe('ipToOuts', () => {
  it('converts innings-pitched decimal notation to outs', () => {
    expect(ipToOuts('5.2')).toBe(17); // 5 innings (15 outs) + 2
    expect(ipToOuts('6')).toBe(18);
    expect(ipToOuts('0.1')).toBe(1);
    expect(ipToOuts('')).toBeUndefined();
  });
});
