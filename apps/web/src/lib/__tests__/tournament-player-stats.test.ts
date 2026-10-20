import { EventType, HitType, PitchOutcome } from '@baseball/shared';
import { loadTournamentPlayerStats } from '../tournament-player-stats';

const SCOPE = { tournamentId: 'tourney', teamId: 'team', seasonId: 'tourney-season' };

let sequence = 0;
function event(gameId: string, eventType: string, payload: Record<string, unknown>, isTopOfInning: boolean) {
  sequence += 1;
  return {
    id: `evt-${sequence}`,
    game_id: gameId,
    sequence_number: sequence,
    event_type: eventType,
    payload,
    is_top_of_inning: isTopOfInning,
  };
}

function fakeDb(rows: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let values = rows[table] ?? [];
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { values = values.filter((row) => row[key] === value); return query; },
        in(key: string, list: unknown[]) { values = values.filter((row) => list.includes(row[key])); return query; },
        order() { return query; },
        range(from: number, to: number) { values = values.slice(from, to + 1); return query; },
        then(resolve: (result: unknown) => unknown) { return Promise.resolve(resolve({ data: values, error: null })); },
      };
      return query;
    },
  };
}

function tournamentRows() {
  sequence = 0;
  return {
    games: [
      { id: 'tourney-game', tournament_id: 'tourney', team_id: 'team', season_id: 'tourney-season', status: 'completed', location_type: 'home', neutral_home_team: null },
      { id: 'tourney-upcoming', tournament_id: 'tourney', team_id: 'team', season_id: 'tourney-season', status: 'scheduled', location_type: 'home', neutral_home_team: null },
      { id: 'regular-game', tournament_id: null, team_id: 'team', season_id: 'regular-season', status: 'completed', location_type: 'home', neutral_home_team: null },
    ],
    players: [
      { id: 'alice', team_id: 'team', first_name: 'Alice', last_name: 'Atbat' },
      { id: 'pat', team_id: 'team', first_name: 'Pat', last_name: 'Pitcher' },
    ],
    game_lineups: [],
    game_events: [
      // Top half: our pitcher faces the opponent.
      event('tourney-game', EventType.PITCH_THROWN, { pitcherId: 'pat', batterId: 'opp-batter', outcome: PitchOutcome.SWINGING_STRIKE }, true),
      event('tourney-game', EventType.PITCH_THROWN, { pitcherId: 'pat', batterId: 'opp-batter', outcome: PitchOutcome.SWINGING_STRIKE }, true),
      event('tourney-game', EventType.PITCH_THROWN, { pitcherId: 'pat', batterId: 'opp-batter', outcome: PitchOutcome.SWINGING_STRIKE }, true),
      event('tourney-game', EventType.STRIKEOUT, { pitcherId: 'pat', batterId: 'opp-batter' }, true),
      // Bottom half: Alice bats against the opponent's pitcher.
      event('tourney-game', EventType.PITCH_THROWN, { pitcherId: 'opp-pitcher', batterId: 'alice', outcome: PitchOutcome.IN_PLAY }, false),
      event('tourney-game', EventType.HIT, { pitcherId: 'opp-pitcher', batterId: 'alice', hitType: HitType.SINGLE }, false),
      event('tourney-game', EventType.WALK, { pitcherId: 'opp-pitcher', batterId: 'alice' }, false),
      // Regular-season game on the same team must not count.
      event('regular-game', EventType.HIT, { pitcherId: 'opp-pitcher', batterId: 'alice', hitType: HitType.HOME_RUN }, false),
    ],
  };
}

describe('loadTournamentPlayerStats', () => {
  it('counts only scored games from the tournament season', async () => {
    const stats = await loadTournamentPlayerStats(fakeDb(tournamentRows()) as never, SCOPE);

    expect(stats.scoredGameCount).toBe(1);
    expect(stats.batting.map((s) => s.playerId)).toEqual(['alice']);
    expect(stats.batting[0].plateAppearances).toBe(2);
    expect(stats.batting[0].hits).toBe(1);
    expect(stats.batting[0].homeRuns).toBe(0);
  });

  it("returns our pitchers and drops the opponent's", async () => {
    const stats = await loadTournamentPlayerStats(fakeDb(tournamentRows()) as never, SCOPE);

    expect(stats.pitching.map((s) => s.playerId)).toEqual(['pat']);
    expect(stats.pitching[0].totalPitches).toBe(3);
    expect(stats.pitching[0].strikeouts).toBe(1);
  });

  it('returns empty lines when no tournament game has been scored', async () => {
    const rows = tournamentRows();
    rows.games = rows.games.filter((g) => g.id !== 'tourney-game');

    const stats = await loadTournamentPlayerStats(fakeDb(rows) as never, SCOPE);

    expect(stats).toEqual({ scoredGameCount: 0, batting: [], pitching: [] });
  });

  it('fails loudly when the games query errors', async () => {
    const db = {
      from() {
        const query = {
          select: () => query, eq: () => query, in: () => query,
          then: (resolve: (result: unknown) => unknown) =>
            Promise.resolve(resolve({ data: null, error: { message: 'permission denied' } })),
        };
        return query;
      },
    };

    await expect(loadTournamentPlayerStats(db as never, SCOPE)).rejects.toThrow('permission denied');
  });
});
