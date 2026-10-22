import { loadTeamSeasonStats, statTierForLevel } from '../load-season-stats';
import { fakeDb } from '@/lib/services/__tests__/fake-db';

const mockFetchAllEventsForGames = jest.fn();
jest.mock('../fetch-events', () => ({
  fetchAllEventsForGames: (...args: unknown[]) => mockFetchAllEventsForGames(...args),
}));
jest.mock('../lineups', () => ({ buildLineupsByGameId: async () => new Map() }));

const mockDerivePitchingStats = jest.fn();
jest.mock('@baseball/shared', () => ({
  ...jest.requireActual('@baseball/shared'),
  derivePitchingStats: (...args: unknown[]) => mockDerivePitchingStats(...args),
}));

const OPTIONS = { includeCatcher: false, includeOpponents: false };
const seasons = {
  data: [
    { id: 's2', name: 'Fall', is_active: false },
    { id: 's1', name: 'Spring', is_active: true },
  ],
};
const players = {
  data: [
    { id: 'p1', first_name: 'Luke', last_name: 'Fox', is_active: true },
    { id: 'p2', first_name: 'Ann', last_name: 'Coit', is_active: true },
    { id: 'p3', first_name: 'Old', last_name: 'Timer', is_active: false },
  ],
};

function pitcherStats(playerId: string, outs: number) {
  return { playerId, playerName: playerId, inningsPitchedOuts: outs, totalPitches: 10 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAllEventsForGames.mockResolvedValue([]);
  mockDerivePitchingStats.mockReturnValue(new Map());
});

describe('loadTeamSeasonStats', () => {
  it('should default to the active season and scope games to it', async () => {
    const { db, calls } = fakeDb({ 'seasons.select': seasons, 'games.select': { data: [{ id: 'g1' }] } });
    const stats = await loadTeamSeasonStats(db, 't1', OPTIONS);

    expect(stats.season).toEqual({ id: 's1', name: 'Spring' });
    expect(stats.gameCount).toBe(1);
    expect(calls.find((c) => c.table === 'games')?.filters).toMatchObject({ team_id: 't1', season_id: 's1' });
    expect(mockFetchAllEventsForGames).toHaveBeenCalledWith(db, ['g1'], expect.any(Array));
  });

  it('should read every scored game when the season id is unknown', async () => {
    const { db, calls } = fakeDb({ 'seasons.select': seasons, 'games.select': { data: [] } });
    const stats = await loadTeamSeasonStats(db, 't1', { ...OPTIONS, seasonId: 'gone' });

    expect(stats.season).toBeNull();
    expect(calls.find((c) => c.table === 'games')?.filters).not.toHaveProperty('season_id');
  });

  it('should read every scored game for "all", even with an active season', async () => {
    const { db, calls } = fakeDb({ 'seasons.select': seasons, 'games.select': { data: [] } });
    const stats = await loadTeamSeasonStats(db, 't1', { ...OPTIONS, seasonId: 'all' });

    expect(stats.season).toBeNull();
    expect(calls.find((c) => c.table === 'games')?.filters).not.toHaveProperty('season_id');
  });

  it("should keep only our pitchers, with each one's latest rest row and 7-day count", async () => {
    mockDerivePitchingStats.mockReturnValue(new Map([
      ['p1', pitcherStats('p1', 9)],
      ['p2', pitcherStats('p2', 12)],
      ['opp', pitcherStats('opp', 21)],
    ]));
    const { db } = fakeDb({
      'seasons.select': seasons,
      'games.select': { data: [] },
      'players.select': players,
      'pitch_counts.select': {
        data: [
          { player_id: 'p1', pitch_count: 60, required_rest_days: 2, can_pitch_next_day: false, game_date: '2026-10-20' },
          { player_id: 'p1', pitch_count: 30, required_rest_days: 0, can_pitch_next_day: true, game_date: '2026-10-10' },
        ],
      },
      'v_pitcher_rolling_7d.select': {
        data: [
          { player_id: 'p1', game_date: '2026-10-20', pitches_7d: 75 },
          { player_id: 'p1', game_date: '2026-10-10', pitches_7d: 30 },
        ],
      },
    });
    const stats = await loadTeamSeasonStats(db, 't1', OPTIONS);

    expect(stats.pitching.map((s) => s.playerId)).toEqual(['p2', 'p1']);
    expect(stats.complianceMap).toEqual({
      p1: { pitchCount: 60, requiredRestDays: 2, canPitchNextDay: false, lastGameDate: '2026-10-20', pitches7d: 75 },
    });
  });

  it('should throw rather than pass a failed read off as an empty one', async () => {
    const { db } = fakeDb({
      'seasons.select': seasons,
      'games.select': { data: [] },
      'players.select': { data: null, error: { message: 'timeout' } },
    });
    await expect(loadTeamSeasonStats(db, 't1', OPTIONS)).rejects.toThrow('players query failed: timeout');
  });

  it('should count active players whose waiver is missing or expired', async () => {
    const { db, calls } = fakeDb({
      'seasons.select': seasons,
      'games.select': { data: [] },
      'players.select': players,
      'player_documents.select': { data: [{ player_id: 'p1', expires_on: null }, { player_id: 'p2', expires_on: '2000-01-01' }] },
    });
    const stats = await loadTeamSeasonStats(db, 't1', OPTIONS);

    expect(stats.missingWaiverCount).toBe(1);
    expect(calls.find((c) => c.table === 'player_documents')?.filters).toMatchObject({ player_id: ['p1', 'p2'] });
  });

  it('should sum catcher innings per player only when asked', async () => {
    const results = {
      'seasons.select': seasons,
      'games.select': { data: [] },
      'players.select': players,
      'catcher_innings.select': {
        data: [
          { player_id: 'p2', innings_caught: 3, game_date: '2026-10-20' },
          { player_id: 'p2', innings_caught: 2.5, game_date: '2026-10-12' },
          { player_id: 'p3', innings_caught: 7, game_date: '2026-10-01' },
        ],
      },
    };
    const withoutCatcher = fakeDb(results);
    await loadTeamSeasonStats(withoutCatcher.db, 't1', OPTIONS);
    expect(withoutCatcher.calls.some((c) => c.table === 'catcher_innings')).toBe(false);

    const { db, calls } = fakeDb(results);
    const stats = await loadTeamSeasonStats(db, 't1', { ...OPTIONS, includeCatcher: true });
    expect(stats.catcher).toEqual([
      { playerId: 'p3', playerName: 'Old Timer', totalInnings: 7, games: 1, lastGameDate: '2026-10-01' },
      { playerId: 'p2', playerName: 'Ann Coit', totalInnings: 5.5, games: 2, lastGameDate: '2026-10-20' },
    ]);
    expect(calls.find((c) => c.table === 'catcher_innings')?.filters).toMatchObject({ season_id: 's1' });
  });

  it("should give each opponent our record against them from the side we batted on", async () => {
    const { db } = fakeDb({
      'seasons.select': seasons,
      'games.select': {
        data: [
          { id: 'g1', opponent_team_id: 'o1', home_score: 5, away_score: 2, location_type: 'home', neutral_home_team: null },
          { id: 'g2', opponent_team_id: 'o1', home_score: 5, away_score: 2, location_type: 'away', neutral_home_team: null },
          { id: 'g3', opponent_team_id: 'o1', home_score: 0, away_score: 0, location_type: 'home', neutral_home_team: null },
        ],
      },
      'opponent_teams.select': { data: [{ id: 'o1', name: 'Eagles' }, { id: 'o2', name: 'Unplayed' }] },
      'opponent_players.select': { data: [] },
    });
    const stats = await loadTeamSeasonStats(db, 't1', { ...OPTIONS, includeOpponents: true });

    expect(stats.opponents).toEqual([
      { teamId: 'o1', teamName: 'Eagles', gamesPlayed: 3, wins: 1, losses: 1, ties: 0, batting: [], pitching: [] },
    ]);
  });
});

describe('statTierForLevel', () => {
  it('should start youth and middle school on youth, college and pro on college, everyone else on high school', () => {
    expect(statTierForLevel('middle_school')).toBe('youth');
    expect(statTierForLevel('pro')).toBe('college');
    expect(statTierForLevel('high_school')).toBe('high_school');
    expect(statTierForLevel(null)).toBe('high_school');
  });
});
