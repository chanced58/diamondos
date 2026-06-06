/**
 * Round-trip tests for the Home Team export builders.
 *
 * The exporter is the inverse of `homeTeamAdapter`: a CSV it produces, fed back
 * through detectAndParse → autoDetect → normalize, must reproduce the original
 * counts. The import adapter is used as the oracle that proves compatibility.
 */
import { homeTeamAdapter } from '../home-team-adapter';
import { autoDetectMapping } from '../mapping-engine';
import {
  toHomeTeamPlayerStatsCsv,
  toHomeTeamTeamStatsCsv,
} from '../home-team-export';
import type { BattingStats } from '../../../types/batting';
import type { PitchingStats } from '../../../types/pitching';

const SEASON = { seasonYear: 2026, seasonLabel: null };
const META = { date: '2026-05-01', opponent: 'Wildcats' };

function batting(overrides: Partial<BattingStats>): BattingStats {
  return {
    playerId: 'p1',
    playerName: 'Ada Lovelace',
    gamesAppeared: 1,
    plateAppearances: 0,
    atBats: 0,
    runs: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    rbi: 0,
    walks: 0,
    strikeouts: 0,
    hitByPitch: 0,
    sacrificeFlies: 0,
    sacrificeHits: 0,
    avg: NaN,
    obp: NaN,
    slg: NaN,
    ops: NaN,
    iso: NaN,
    babip: NaN,
    kPct: NaN,
    bbPct: NaN,
    woba: NaN,
    battedBalls: 0,
    hardHitBalls: 0,
    hardHitPct: NaN,
    qab: 0,
    qabPct: NaN,
    ...overrides,
  };
}

function pitching(overrides: Partial<PitchingStats>): PitchingStats {
  return {
    playerId: 'p2',
    playerName: 'Alan Turing',
    gamesAppeared: 1,
    inningsPitchedOuts: 0,
    totalPitches: 0,
    strikes: 0,
    balls: 0,
    strikePercentage: 0,
    firstPitchStrikes: 0,
    firstPitchStrikePercentage: 0,
    threeBallCountPAs: 0,
    threeZeroCountPAs: 0,
    totalPAs: 0,
    threeBallCountPercentage: 0,
    threeZeroCountPercentage: 0,
    hitsAllowed: 0,
    runsAllowed: 0,
    earnedRunsAllowed: 0,
    walksAllowed: 0,
    strikeouts: 0,
    hitBatters: 0,
    wildPitches: 0,
    era: Infinity,
    whip: Infinity,
    strikeoutsPerSeven: 0,
    walksPerSeven: 0,
    baByCount: {},
    ...overrides,
  };
}

/** Parse a player-stats CSV through the import adapter (the oracle). */
function parsePlayerCsv(csv: string) {
  const parsed = homeTeamAdapter.detectAndParse([{ name: 'player-stats.csv', bytes: csv }]);
  const mapping = autoDetectMapping(
    parsed.columnsByCategory.player_stats!,
    homeTeamAdapter.fieldAliases.player_stats!,
  );
  return (parsed.rawRows.player_stats ?? []).map((row) =>
    homeTeamAdapter.normalizePlayerStat(row, mapping, SEASON),
  );
}

describe('toHomeTeamPlayerStatsCsv', () => {
  it('round-trips a batting line through the import adapter', () => {
    const csv = toHomeTeamPlayerStatsCsv(
      [
        {
          playerId: 'uuid-ada',
          firstName: 'Ada',
          lastName: 'Lovelace',
          jerseyNumber: 7,
          batting: batting({
            plateAppearances: 5,
            atBats: 4,
            runs: 2,
            hits: 3,
            doubles: 1,
            triples: 0,
            homeRuns: 1,
            rbi: 3,
            walks: 1,
            strikeouts: 1,
            hitByPitch: 0,
            sacrificeFlies: 0,
            sacrificeHits: 0,
          }),
        },
      ],
      META,
    );

    const [row] = parsePlayerCsv(csv);
    expect(row).toMatchObject({
      externalPlayerId: 'uuid-ada',
      playerName: 'Ada Lovelace',
      jerseyNumber: 7,
      gameDate: '2026-05-01',
      opponentLabel: 'Wildcats',
      isSeasonSummary: false,
      gamesPlayed: 1,
      batting: { pa: 5, ab: 4, r: 2, h: 3, '2b': 1, hr: 1, rbi: 3, bb: 1, so: 1 },
    });
    expect(row?.pitching).toBeUndefined();
    expect(row?.fielding).toBeUndefined();
  });

  it('round-trips a pitching line with IP decimal notation', () => {
    const csv = toHomeTeamPlayerStatsCsv(
      [
        {
          playerId: 'uuid-alan',
          firstName: 'Alan',
          lastName: 'Turing',
          jerseyNumber: 1,
          pitching: pitching({
            inningsPitchedOuts: 17, // 5.2 IP
            totalPitches: 80,
            strikes: 52,
            balls: 28,
            hitsAllowed: 4,
            runsAllowed: 2,
            earnedRunsAllowed: 2,
            walksAllowed: 1,
            strikeouts: 7,
            hitBatters: 1,
            wildPitches: 0,
          }),
        },
      ],
      META,
    );

    const [row] = parsePlayerCsv(csv);
    expect(row?.pitching).toMatchObject({
      ipOuts: 17,
      pitches: 80,
      strikes: 52,
      balls: 28,
      h: 4,
      r: 2,
      er: 2,
      bb: 1,
      so: 7,
      hbp: 1,
    });
    expect(row?.batting).toBeUndefined();
  });

  it('round-trips a fielding line', () => {
    const csv = toHomeTeamPlayerStatsCsv(
      [
        {
          playerId: 'uuid-ada',
          firstName: 'Ada',
          lastName: 'Lovelace',
          jerseyNumber: 7,
          fielding: { putouts: 3, assists: 2, errors: 1 },
        },
      ],
      META,
    );

    const [row] = parsePlayerCsv(csv);
    expect(row?.fielding).toEqual({ po: 3, a: 2, e: 1 });
  });

  it('preserves a name containing a comma through CSV escaping', () => {
    const csv = toHomeTeamPlayerStatsCsv(
      [
        {
          playerId: 'uuid-x',
          firstName: 'Ada',
          lastName: 'Lovelace, Jr',
          jerseyNumber: null,
          batting: batting({ plateAppearances: 1, atBats: 1, hits: 1 }),
        },
      ],
      META,
    );

    const [row] = parsePlayerCsv(csv);
    expect(row?.playerName).toBe('Ada Lovelace, Jr');
    expect(row?.batting).toMatchObject({ pa: 1, ab: 1, h: 1 });
  });
});

describe('toHomeTeamTeamStatsCsv', () => {
  it('round-trips a single-game team record through the import adapter', () => {
    const csv = toHomeTeamTeamStatsCsv({
      teamName: 'Hawks',
      date: '2026-05-01',
      opponent: 'Wildcats',
      wins: 1,
      losses: 0,
      ties: 0,
      runsFor: 7,
      runsAgainst: 3,
    });

    const parsed = homeTeamAdapter.detectAndParse([{ name: 'team-stats.csv', bytes: csv }]);
    const mapping = autoDetectMapping(
      parsed.columnsByCategory.team_stats!,
      homeTeamAdapter.fieldAliases.team_stats!,
    );
    const row = homeTeamAdapter.normalizeTeamStat(parsed.rawRows.team_stats![0], mapping, SEASON);
    expect(row).toMatchObject({
      teamName: 'Hawks',
      gameDate: '2026-05-01',
      opponentLabel: 'Wildcats',
      isSeasonSummary: false,
      gamesPlayed: 1,
      wins: 1,
      losses: 0,
      ties: 0,
      runsFor: 7,
      runsAgainst: 3,
    });
  });
});
