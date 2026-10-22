import { loadTeamComparison, winPct } from '../team-comparison';
import { fakeDb } from '@/lib/services/__tests__/fake-db';

const mockGetLeagueTeams = jest.fn();
jest.mock('@baseball/database', () => ({
  getLeagueTeams: (...args: unknown[]) => mockGetLeagueTeams(...args),
  leagueMemberName: (m: { teams?: { name: string }; opponent_teams?: { name: string } }) =>
    m.teams?.name ?? m.opponent_teams?.name ?? 'Unknown',
}));
jest.mock('../fetch-events', () => ({ fetchAllEventsForGames: async () => [] }));
const mockBuildLineups = jest.fn();
jest.mock('../lineups', () => ({ buildLineupsByGameId: (...args: unknown[]) => mockBuildLineups(...args) }));

// Stat lines keyed by player id, whatever the events.
const mockBatting = new Map<string, { hits: number; atBats: number }>();
const mockPitching = new Map<string, { inningsPitchedOuts: number; runsAllowed: number; earnedRunsAllowed: number; strikeouts: number }>();
jest.mock('@baseball/shared', () => {
  const actual = jest.requireActual('@baseball/shared');
  const linesFor = <T,>(lines: Map<string, T>, players: { id: string }[]) =>
    new Map(players.filter((p) => lines.has(p.id)).map((p) => [p.id, { playerId: p.id, ...lines.get(p.id)! }]));
  return {
    ...actual,
    deriveBattingStats: (_e: unknown, players: { id: string }[]) => linesFor(mockBatting, players),
    derivePitchingStats: (_e: unknown, players: { id: string }[]) => linesFor(mockPitching, players),
    computeOpponentBatting: () => [{ playerId: 'o-bat', h: 3, ab: 10 }],
  };
});

const HUSKIES = { team_id: 't1', opponent_team_id: null, teams: { name: 'Huskies' } };
const RAMS = { team_id: 't2', opponent_team_id: null, teams: { name: 'Rams' } };
const EAGLES = { team_id: null, opponent_team_id: 'o1', opponent_teams: { name: 'Eagles' } };

function game(id: string, teamId: string, home: number, away: number, opponentTeamId: string | null = null, location = 'home') {
  return { id, team_id: teamId, opponent_team_id: opponentTeamId, home_score: home, away_score: away, location_type: location, neutral_home_team: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBatting.clear();
  mockPitching.clear();
  mockBuildLineups.mockResolvedValue(new Map());
});

describe('loadTeamComparison', () => {
  it('should total each team and rank them by winning percentage, with ERA from earned runs', async () => {
    mockGetLeagueTeams.mockResolvedValue([HUSKIES, RAMS]);
    mockBatting.set('h1', { hits: 4, atBats: 10 });
    mockPitching.set('h1', { inningsPitchedOuts: 21, runsAllowed: 5, earnedRunsAllowed: 2, strikeouts: 9 });
    const { db } = fakeDb({
      'games.select': {
        data: [
          game('g1', 't1', 5, 2),
          game('g2', 't1', 1, 3),
          game('g3', 't2', 6, 1),
          game('g4', 't2', 4, 2, null, 'away'), // Rams away: they scored 2, lost
        ],
      },
      'players.select': { data: [{ id: 'h1', team_id: 't1', first_name: 'Luke', last_name: 'Fox' }] },
    });

    const rows = await loadTeamComparison(db, 'l1');

    expect(rows.map((r) => r.teamName)).toEqual(['Huskies', 'Rams']);
    expect(rows[0]).toMatchObject({
      gamesPlayed: 2, wins: 1, losses: 1, ties: 0, runsScored: 6, runsAllowed: 5,
      teamAvg: 0.4, totalHits: 4, totalStrikeouts: 9, isOpponentTeam: false,
    });
    expect(rows[0].teamEra).toBeCloseTo(2);
    expect(rows[1]).toMatchObject({ wins: 1, losses: 1, runsScored: 8, runsAllowed: 5, teamAvg: 0, teamEra: 0 });
    expect(mockBuildLineups).toHaveBeenCalledWith(db, expect.any(Array), { strict: true });
  });

  it('should see an opponent team from the other side of the games against it', async () => {
    mockGetLeagueTeams.mockResolvedValue([HUSKIES, EAGLES]);
    const { db } = fakeDb({
      'games.select': { data: [game('g1', 't1', 5, 2, 'o1'), game('g2', 't1', 0, 0, 'o1')] },
      'players.select': { data: [] },
      'opponent_players.select': { data: [{ id: 'o-bat', opponent_team_id: 'o1', first_name: 'X', last_name: 'Y' }] },
    });

    const rows = await loadTeamComparison(db, 'l1');
    const eagles = rows.find((r) => r.teamId === 'o1')!;
    expect(eagles).toMatchObject({ isOpponentTeam: true, gamesPlayed: 2, wins: 0, losses: 1, ties: 1, runsScored: 2, runsAllowed: 5 });
    expect(eagles.teamAvg).toBeCloseTo(0.3);
  });

  it('should throw rather than compare part of the league when a read fails', async () => {
    mockGetLeagueTeams.mockResolvedValue([HUSKIES]);
    const { db } = fakeDb({ 'games.select': { data: null, error: { message: 'timeout' } } });
    await expect(loadTeamComparison(db, 'l1')).rejects.toThrow('games query failed: timeout');
  });

  it('should be empty for a league with no teams', async () => {
    mockGetLeagueTeams.mockResolvedValue([]);
    expect(await loadTeamComparison(fakeDb().db, 'l1')).toEqual([]);
  });
});

describe('winPct', () => {
  it('should count ties as games and be 0 with none played', () => {
    expect(winPct({ wins: 2, losses: 1, ties: 1 })).toBe(0.5);
    expect(winPct({ wins: 0, losses: 0, ties: 0 })).toBe(0);
  });
});
