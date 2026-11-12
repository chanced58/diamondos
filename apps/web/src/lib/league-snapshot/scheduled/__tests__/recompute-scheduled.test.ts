import { recomputeScheduledLeagueSnapshot } from '../recompute-scheduled';
import { recomputeLeagueSnapshot } from '../../recompute';
import { fakeDb, type FakeCall, type FakeResult, type FakeResultFor } from '@/lib/services/__tests__/fake-db';

const LEAGUE = 'league-1';
const SEASON = 'Spring 2027';
const HAWKS = 'team-hawks';
const OWLS = 'team-owls';
/** The Owls' league roster record (the Hawks' rows record Owls players through it). */
const OWLS_RECORD = 'record-owls';
/** The Hawks' league roster record. */
const HAWKS_RECORD = 'record-hawks';

type Row = Record<string, unknown>;

function event(gameId: string, seq: number, type: string, isTop: boolean, payload: Row = {}): Row {
  return {
    id: `${gameId}-e${seq}`,
    game_id: gameId,
    sequence_number: seq,
    event_type: type,
    inning: 1,
    is_top_of_inning: isTop,
    payload,
  };
}

interface LeagueGameSpec {
  id: string;
  home: string;
  away: string;
  scheduledAt: string;
  /** Status of each team's row; omit for a row with no book (scheduled). */
  homeStatus?: string;
  awayStatus?: string;
  homeScore?: number;
  awayScore?: number;
}

/** A team's games row for a league game; each row records the other team through that team's roster record. */
function teamRow(spec: LeagueGameSpec, side: 'home' | 'away'): Row {
  const teamId = side === 'home' ? spec.home : spec.away;
  const otherTeam = side === 'home' ? spec.away : spec.home;
  return {
    id: `${spec.id}-${side}`,
    team_id: teamId,
    status: (side === 'home' ? spec.homeStatus : spec.awayStatus) ?? 'scheduled',
    result_source: null,
    home_score: spec.homeScore ?? 0,
    away_score: spec.awayScore ?? 0,
    location_type: side,
    neutral_home_team: null,
    opponent_team_id: otherTeam === HAWKS ? HAWKS_RECORD : OWLS_RECORD,
  };
}

interface Scenario {
  games: LeagueGameSpec[];
  events?: Record<string, Row[]>;
  /** Current rosters: players.team_id. */
  roster?: Row[];
  memberships?: Row[];
  records?: Row[];
  manual?: Row[];
  manualLines?: Row[];
  reconciliations?: Row[];
  overrides?: Record<string, FakeResult | FakeResultFor>;
}

const PLAYERS: Row[] = [
  { id: 'h1', team_id: HAWKS, first_name: 'Hal', last_name: 'Hawk' },
  { id: 'hp', team_id: HAWKS, first_name: 'Hank', last_name: 'Pitcher' },
  { id: 'o1', team_id: OWLS, first_name: 'Oli', last_name: 'Owl' },
  { id: 'op', team_id: OWLS, first_name: 'Otto', last_name: 'Pitcher' },
];

const RECORDS: Row[] = [
  { id: 'rec-o1', opponent_team_id: OWLS_RECORD, linked_player_id: 'o1', placeholder_game_id: null, is_fill_in: false },
  { id: 'rec-op', opponent_team_id: OWLS_RECORD, linked_player_id: 'op', placeholder_game_id: null, is_fill_in: false },
  { id: 'rec-h1', opponent_team_id: HAWKS_RECORD, linked_player_id: 'h1', placeholder_game_id: null, is_fill_in: false },
  { id: 'rec-hp', opponent_team_id: HAWKS_RECORD, linked_player_id: 'hp', placeholder_game_id: null, is_fill_in: false },
];

function byIds(rows: Row[], column: string, ids: unknown): Row[] {
  const list = Array.isArray(ids) ? ids : [ids];
  return rows.filter((row) => list.includes(row[column]));
}

function scheduledLeague(scenario: Scenario) {
  const rows = scenario.games.flatMap((spec) => [teamRow(spec, 'home'), teamRow(spec, 'away')]);
  const events = scenario.events ?? {};
  const roster = scenario.roster ?? PLAYERS;
  return fakeDb({
    'leagues.select': { data: { schedules_games: true } },
    'league_members.select': {
      data: [
        { team_id: HAWKS, division_id: 'div-1' },
        { team_id: OWLS, division_id: null },
      ],
    },
    'league_games.select': {
      data: scenario.games.map((spec) => ({
        id: spec.id,
        home_team_id: spec.home,
        away_team_id: spec.away,
        home_game_id: `${spec.id}-home`,
        away_game_id: `${spec.id}-away`,
        scheduled_at: spec.scheduledAt,
      })),
    },
    'league_players.select': { data: [] },
    'teams.select': { data: [{ id: HAWKS, name: 'Hawks' }, { id: OWLS, name: 'Owls' }] },
    'games.select': (call: FakeCall) => ({ data: byIds(rows, 'id', call.filters.id) }),
    'game_events.select': (call: FakeCall) => ({
      data: (call.filters.game_id as string[]).flatMap((gameId) => events[gameId] ?? []),
    }),
    'game_reconciliations.select': { data: scenario.reconciliations ?? [] },
    'league_game_manual_results.select': { data: scenario.manual ?? [] },
    'league_game_manual_batting_lines.select': { data: scenario.manualLines ?? [] },
    'players.select': (call: FakeCall) =>
      call.filters.team_id ? { data: byIds(roster, 'team_id', call.filters.team_id) } : { data: byIds(PLAYERS, 'id', call.filters.id) },
    'player_team_memberships.select': (call: FakeCall) => ({
      data: byIds(scenario.memberships ?? [], 'team_id', call.filters.team_id),
    }),
    'game_lineups.select': { data: [] },
    'opponent_players.select': (call: FakeCall) => ({
      data: byIds(scenario.records ?? RECORDS, 'opponent_team_id', call.filters.opponent_team_id),
    }),
    ...scenario.overrides,
  });
}

function inserted(calls: FakeCall[], table: string): Row[] {
  return calls.filter((call) => call.table === table && call.op === 'insert').flatMap((call) => call.payload as Row[]);
}

function playerRow(calls: FakeCall[], scope: string, playerId: string, teamId?: string): Row | undefined {
  return inserted(calls, 'league_player_stat_snapshot').find(
    (row) => row.scope === scope && row.player_id === playerId && (teamId === undefined || row.team_id === teamId),
  );
}

function standing(calls: FakeCall[], teamId: string): Row | undefined {
  return inserted(calls, 'league_standings_snapshot').find((row) => row.team_id === teamId);
}

/** Hawks (home) book of lg-1: Owls' o1 homers off hp, then Hawks' h1 singles and strikes out against op. */
const HAWKS_BOOK = [
  event('lg-1-home', 1, 'game_start', true, { homeLineupPitcherId: 'hp', awayLineupPitcherId: 'rec-op' }),
  event('lg-1-home', 2, 'hit', true, { opponentBatterId: 'rec-o1', pitcherId: 'hp', hitType: 'home_run' }),
  event('lg-1-home', 3, 'inning_change', true),
  event('lg-1-home', 4, 'hit', false, { batterId: 'h1', opponentPitcherId: 'rec-op', hitType: 'single' }),
  event('lg-1-home', 5, 'strikeout', false, { batterId: 'h1', opponentPitcherId: 'rec-op' }),
  event('lg-1-home', 6, 'game_end', false),
];

const LG1: LeagueGameSpec = {
  id: 'lg-1',
  home: HAWKS,
  away: OWLS,
  scheduledAt: '2027-04-01T23:00:00Z',
  homeStatus: 'completed',
  homeScore: 0,
  awayScore: 1,
};

describe('recomputeScheduledLeagueSnapshot', () => {
  it("should credit both teams' players from a book only the home team scored", async () => {
    const { db, calls } = scheduledLeague({ games: [LG1], events: { 'lg-1-home': HAWKS_BOOK } });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(playerRow(calls, 'team', 'o1', OWLS)).toMatchObject({ team_name: 'Owls', first_name: 'Oli', plate_appearances: 1 });
    expect(playerRow(calls, 'team', 'o1', OWLS)?.stats).toMatchObject({ hits: 1, homeRuns: 1 });
    expect(playerRow(calls, 'team', 'h1', HAWKS)?.stats).toMatchObject({ hits: 1, homeRuns: 0 });
    expect(playerRow(calls, 'team', 'op', OWLS)?.stats).toMatchObject({ strikeoutsP: 1 });
    expect(playerRow(calls, 'team', 'hp', HAWKS)).toBeDefined();
    // Nobody is credited to the team they played against.
    expect(playerRow(calls, 'team', 'o1', HAWKS)).toBeUndefined();
    expect(playerRow(calls, 'team', 'hp', OWLS)).toBeUndefined();
    expect(playerRow(calls, 'season', 'o1')).toMatchObject({ team_id: OWLS, plate_appearances: 1 });

    expect(standing(calls, OWLS)).toMatchObject({ wins: 1, losses: 0, runs_for: 1, runs_against: 0, division_id: null });
    expect(standing(calls, HAWKS)).toMatchObject({ wins: 0, losses: 1, runs_for: 0, runs_against: 1, division_id: 'div-1' });
  });

  it("should keep a traded player's earlier games with their old team and combine the season line under the new team", async () => {
    // t1 batted for the Owls on April 1 (Owls' book), then was traded and batted for the Hawks on April 8 (Hawks' book).
    const lg2: LeagueGameSpec = { id: 'lg-2', home: HAWKS, away: OWLS, scheduledAt: '2027-04-08T23:00:00Z', homeStatus: 'completed' };
    const lg1: LeagueGameSpec = { id: 'lg-1', home: HAWKS, away: OWLS, scheduledAt: '2027-04-01T23:00:00Z', awayStatus: 'completed' };
    const { db, calls } = scheduledLeague({
      // Listed newest first: the snapshot must still treat April 8 as the latest.
      games: [lg2, lg1],
      roster: [...PLAYERS, { id: 't1', team_id: HAWKS, first_name: 'Tia', last_name: 'Traded' }],
      memberships: [
        { player_id: 't1', team_id: OWLS },
        { player_id: 't1', team_id: HAWKS },
      ],
      events: {
        'lg-1-away': [
          event('lg-1-away', 1, 'game_start', true),
          event('lg-1-away', 2, 'hit', true, { batterId: 't1', hitType: 'single' }),
        ],
        'lg-2-home': [
          event('lg-2-home', 1, 'game_start', true),
          event('lg-2-home', 2, 'hit', false, { batterId: 't1', hitType: 'home_run' }),
        ],
      },
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(playerRow(calls, 'team', 't1', OWLS)).toMatchObject({ team_name: 'Owls' });
    expect(playerRow(calls, 'team', 't1', OWLS)?.stats).toMatchObject({ hits: 1, homeRuns: 0 });
    expect(playerRow(calls, 'team', 't1', HAWKS)?.stats).toMatchObject({ hits: 1, homeRuns: 1 });
    const season = inserted(calls, 'league_player_stat_snapshot').filter((row) => row.scope === 'season' && row.player_id === 't1');
    expect(season).toHaveLength(1);
    expect(season[0]).toMatchObject({ team_id: HAWKS, team_name: 'Hawks', plate_appearances: 2 });
    expect(season[0].stats).toMatchObject({ hits: 2, homeRuns: 1, avg: 1 });
  });

  it('should count placeholder at-bats in team totals but not on player rows', async () => {
    const { db, calls } = scheduledLeague({
      games: [LG1],
      records: [
        ...RECORDS,
        { id: 'rec-unknown', opponent_team_id: OWLS_RECORD, linked_player_id: null, placeholder_game_id: 'lg-1', is_fill_in: false },
      ],
      events: {
        'lg-1-home': [
          event('lg-1-home', 1, 'game_start', true, { homeLineupPitcherId: 'hp' }),
          event('lg-1-home', 2, 'strikeout', true, { opponentBatterId: 'rec-o1', pitcherId: 'hp' }),
          event('lg-1-home', 3, 'hit', true, { opponentBatterId: 'rec-unknown', pitcherId: 'hp', hitType: 'double' }),
        ],
      },
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    const owlsRows = inserted(calls, 'league_player_stat_snapshot').filter((row) => row.team_id === OWLS);
    expect(owlsRows.map((row) => row.player_id)).toEqual(['o1', 'o1']);
    expect(inserted(calls, 'league_player_stat_snapshot').some((row) => String(row.player_id).startsWith('placeholder:'))).toBe(false);
    const owlsStats = inserted(calls, 'league_team_stat_snapshot').find((row) => row.team_id === OWLS);
    // o1 0-for-1 plus the placeholder's double: 1 hit in 2 at-bats.
    expect(owlsStats?.stats).toMatchObject({ teamAvg: 0.5 });
  });

  it('should ignore team-created games in a league that schedules games', async () => {
    const { db, calls } = scheduledLeague({
      games: [LG1],
      events: {
        'lg-1-home': HAWKS_BOOK,
        // A scrimmage the Hawks created against the Owls: never read, never counted.
        scrimmage: [event('scrimmage', 1, 'hit', false, { batterId: 'h1', hitType: 'home_run' })],
      },
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    const leagueGamesRead = calls.find((call) => call.table === 'league_games');
    expect(leagueGamesRead?.filters).toEqual({ league_id: LEAGUE, season: SEASON, 'status!=': 'cancelled' });
    const gameIdsRead = calls
      .filter((call) => call.table === 'games' || call.table === 'game_events')
      .flatMap((call) => (call.filters.id ?? call.filters.game_id) as string[]);
    expect(gameIdsRead).not.toContain('scrimmage');
    expect(playerRow(calls, 'team', 'h1', HAWKS)?.stats).toMatchObject({ homeRuns: 0 });
    expect(standing(calls, HAWKS)).toMatchObject({ wins: 0, losses: 1 });
  });

  it('should count a forfeit in the standings without runs', async () => {
    const { db, calls } = scheduledLeague({
      games: [{ id: 'lg-1', home: HAWKS, away: OWLS, scheduledAt: '2027-04-01T23:00:00Z' }],
      manual: [{ league_game_id: 'lg-1', kind: 'forfeit', home_runs: null, away_runs: null, forfeit_winner_team_id: OWLS }],
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(standing(calls, OWLS)).toMatchObject({ wins: 1, losses: 0, runs_for: 0, runs_against: 0 });
    expect(standing(calls, HAWKS)).toMatchObject({ wins: 0, losses: 1, runs_for: 0, runs_against: 0 });
    expect(inserted(calls, 'league_player_stat_snapshot')).toEqual([]);
  });

  it('should credit hand-entered batting lines to the team the player batted for', async () => {
    const { db, calls } = scheduledLeague({
      games: [{ id: 'lg-1', home: HAWKS, away: OWLS, scheduledAt: '2027-04-01T23:00:00Z' }],
      manual: [{ league_game_id: 'lg-1', kind: 'batting', home_runs: 5, away_runs: 2, forfeit_winner_team_id: null }],
      manualLines: [
        { league_game_id: 'lg-1', team_id: HAWKS, player_id: 'h1', ab: 4, r: 1, h: 2, doubles: 1, triples: 0, hr: 0, rbi: 2, bb: 0, so: 1, hbp: 0, sf: 0, sb: 0 },
      ],
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(playerRow(calls, 'team', 'h1', HAWKS)?.stats).toMatchObject({ hits: 2, doubles: 1, avg: 0.5 });
    expect(standing(calls, HAWKS)).toMatchObject({ wins: 1, runs_for: 5, runs_against: 2 });
  });

  it("should take a player's line from the away book when the home coach accepted the away value", async () => {
    const lg: LeagueGameSpec = { ...LG1, awayStatus: 'completed', homeScore: 0, awayScore: 1 };
    const { db, calls } = scheduledLeague({
      games: [lg],
      events: {
        'lg-1-home': HAWKS_BOOK,
        // The Owls' book has o1 with a single, not a home run.
        'lg-1-away': [
          event('lg-1-away', 1, 'game_start', true),
          event('lg-1-away', 2, 'hit', true, { batterId: 'o1', hitType: 'single' }),
        ],
      },
      reconciliations: [
        {
          home_game_id: 'lg-1-home',
          conflicts: [{ kind: 'player_batting', playerId: 'o1', stat: 'homeRuns', homeLog: 1, awayLog: 0 }],
          resolved_overrides: [{ key: 'player_batting:o1:homeRuns', useAwayValue: true }],
        },
      ],
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(playerRow(calls, 'team', 'o1', OWLS)?.stats).toMatchObject({ hits: 1, homeRuns: 0 });
    // Everyone else keeps the home book's line.
    expect(playerRow(calls, 'team', 'h1', HAWKS)?.stats).toMatchObject({ hits: 1 });
  });

  it('should not count a placeholder twice when the home coach takes the away line for that player', async () => {
    const lg: LeagueGameSpec = { ...LG1, awayStatus: 'completed', homeScore: 0, awayScore: 0 };
    const { db, calls } = scheduledLeague({
      games: [lg],
      records: [
        ...RECORDS,
        { id: 'rec-ph', opponent_team_id: OWLS_RECORD, linked_player_id: null, placeholder_game_id: 'lg-1', is_fill_in: false },
      ],
      events: {
        // The Hawks' scorer didn't know o1 and recorded a placeholder striking out.
        'lg-1-home': [
          event('lg-1-home', 1, 'game_start', true),
          event('lg-1-home', 2, 'strikeout', true, { opponentBatterId: 'rec-ph' }),
        ],
        // The Owls' book has o1 singling in that at-bat.
        'lg-1-away': [
          event('lg-1-away', 1, 'game_start', true),
          event('lg-1-away', 2, 'hit', true, { batterId: 'o1', hitType: 'single' }),
        ],
      },
      reconciliations: [
        {
          home_game_id: 'lg-1-home',
          conflicts: [{ kind: 'player_batting', playerId: 'o1', stat: 'hits', homeLog: 0, awayLog: 1 }],
          resolved_overrides: [{ key: 'player_batting:o1:hits', useAwayValue: true }],
        },
      ],
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(playerRow(calls, 'team', 'o1', OWLS)?.stats).toMatchObject({ hits: 1 });
    // Team totals come from the home book alone: one at-bat, no hits — not two at-bats.
    const owlsStats = inserted(calls, 'league_team_stat_snapshot').find((row) => row.team_id === OWLS);
    expect(owlsStats?.stats).toMatchObject({ teamAvg: 0 });
  });

  it('should read every page of a list read past the 1000-row cap', async () => {
    // 1000 placeholders from other games fill the first page of the roster-record read.
    const filler = Array.from({ length: 1000 }, (_, index) => ({
      id: `filler-${String(index).padStart(4, '0')}`,
      opponent_team_id: OWLS_RECORD,
      linked_player_id: null,
      placeholder_game_id: 'lg-other',
      is_fill_in: false,
    }));
    const allRecords = [...filler, ...RECORDS];
    const { db, calls } = scheduledLeague({
      games: [LG1],
      events: { 'lg-1-home': HAWKS_BOOK },
      overrides: {
        'opponent_players.select': (call: FakeCall) => {
          const [from, to] = call.range ?? [0, allRecords.length - 1];
          return { data: allRecords.slice(from, to + 1) };
        },
      },
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    const pages = calls.filter((call) => call.table === 'opponent_players').map((call) => call.range);
    expect(pages).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    // rec-o1 is on the second page: without it o1's home run would go uncredited.
    expect(playerRow(calls, 'team', 'o1', OWLS)?.stats).toMatchObject({ homeRuns: 1 });
  });

  it('should throw when a snapshot insert fails', async () => {
    const { db } = scheduledLeague({
      games: [LG1],
      events: { 'lg-1-home': HAWKS_BOOK },
      overrides: { 'league_standings_snapshot.insert': { error: { message: 'permission denied' } } },
    });

    await expect(recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7)).rejects.toThrow(
      `league_standings_snapshot insert failed (league=${LEAGUE} season=${SEASON}): permission denied`,
    );
  });

  it('should throw when clearing the old snapshot fails', async () => {
    const { db, calls } = scheduledLeague({
      games: [LG1],
      overrides: { 'league_player_stat_snapshot.delete': { error: { message: 'timeout' } } },
    });

    await expect(recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7)).rejects.toThrow(
      `league_player_stat_snapshot delete failed (league=${LEAGUE} season=${SEASON}): timeout`,
    );
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
  });
});

describe('recomputeScheduledLeagueSnapshot — standings streaks', () => {
  it("should give each team its current streak from the league games in the order played", async () => {
    // Listed newest first; the Owls won on April 1 and April 8, the Hawks lost both.
    const lg2: LeagueGameSpec = { ...LG1, id: 'lg-2', scheduledAt: '2027-04-08T23:00:00Z', homeScore: 2, awayScore: 6 };
    const { db, calls } = scheduledLeague({
      games: [lg2, LG1],
      events: {
        'lg-1-home': HAWKS_BOOK,
        'lg-2-home': [event('lg-2-home', 1, 'game_start', true), event('lg-2-home', 2, 'game_end', false)],
      },
    });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(standing(calls, OWLS)).toMatchObject({ wins: 2, streak: 'W2' });
    expect(standing(calls, HAWKS)).toMatchObject({ losses: 2, streak: 'L2' });
  });

  it("should leave the streak empty for a team that hasn't played", async () => {
    const { db, calls } = scheduledLeague({ games: [{ id: 'lg-1', home: HAWKS, away: OWLS, scheduledAt: '2027-04-01T23:00:00Z' }] });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(standing(calls, HAWKS)).toMatchObject({ wins: 0, losses: 0, streak: '' });
  });
});

/** Hawks (home) book: hp gives up o1's solo home run, then strikes out the side. */
const ONE_INNING_ONE_EARNED_RUN = [
  event('lg-1-home', 1, 'game_start', true, { homeLineupPitcherId: 'hp', awayLineupPitcherId: 'rec-op' }),
  event('lg-1-home', 2, 'hit', true, { opponentBatterId: 'rec-o1', pitcherId: 'hp', hitType: 'home_run' }),
  event('lg-1-home', 3, 'strikeout', true, { opponentBatterId: 'rec-o1', pitcherId: 'hp' }),
  event('lg-1-home', 4, 'strikeout', true, { opponentBatterId: 'rec-o1', pitcherId: 'hp' }),
  event('lg-1-home', 5, 'strikeout', true, { opponentBatterId: 'rec-o1', pitcherId: 'hp' }),
];

describe('recomputeScheduledLeagueSnapshot — innings per game', () => {
  it('should calculate player and team ERA over 7 innings by default', async () => {
    const { db, calls } = scheduledLeague({ games: [LG1], events: { 'lg-1-home': ONE_INNING_ONE_EARNED_RUN } });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 7);

    expect(playerRow(calls, 'team', 'hp', HAWKS)?.stats).toMatchObject({ era: 7 });
    expect(inserted(calls, 'league_team_stat_snapshot').find((row) => row.team_id === HAWKS)?.stats).toMatchObject({ teamEra: 7 });
  });

  it('should calculate player and team ERA over 9 innings for an adult league', async () => {
    const { db, calls } = scheduledLeague({ games: [LG1], events: { 'lg-1-home': ONE_INNING_ONE_EARNED_RUN } });

    await recomputeScheduledLeagueSnapshot(db, LEAGUE, SEASON, 9);

    expect(playerRow(calls, 'team', 'hp', HAWKS)?.stats).toMatchObject({ era: 9 });
    expect(playerRow(calls, 'season', 'hp', HAWKS)?.stats).toMatchObject({ era: 9 });
    expect(inserted(calls, 'league_team_stat_snapshot').find((row) => row.team_id === HAWKS)?.stats).toMatchObject({ teamEra: 9 });
  });
});

describe('recomputeLeagueSnapshot', () => {
  it('should build a league that schedules games from its league games', async () => {
    const { db, calls } = scheduledLeague({ games: [LG1], events: { 'lg-1-home': HAWKS_BOOK } });

    await recomputeLeagueSnapshot(db as never, LEAGUE, SEASON);

    expect(calls.some((call) => call.table === 'league_games')).toBe(true);
    expect(calls.some((call) => call.table === 'seasons')).toBe(false);
    expect(standing(calls, OWLS)).toMatchObject({ wins: 1 });
  });

  it("should take the innings per game from the league's scoring settings", async () => {
    const { db, calls } = scheduledLeague({
      games: [LG1],
      events: { 'lg-1-home': ONE_INNING_ONE_EARNED_RUN },
      overrides: {
        'leagues.select': { data: { schedules_games: true, scoring_settings: { gameLength: { statInnings: 9 } } } },
      },
    });

    await recomputeLeagueSnapshot(db as never, LEAGUE, SEASON);

    expect(playerRow(calls, 'team', 'hp', HAWKS)?.stats).toMatchObject({ era: 9 });
  });

  it("should write every player's line under both scopes for a league whose teams create games", async () => {
    const { db, calls } = fakeDb({
      'leagues.select': { data: { schedules_games: false } },
      'league_members.select': { data: [{ team_id: HAWKS, opponent_team_id: null, division_id: null }] },
      'seasons.select': { data: [{ id: 'season-1' }] },
      'games.select': (call: FakeCall) =>
        call.filters.season_id
          ? { data: [{ id: 'g1' }] }
          : {
              data: [
                {
                  id: 'g1',
                  team_id: HAWKS,
                  opponent_team_id: null,
                  home_score: 3,
                  away_score: 1,
                  location_type: 'home',
                  neutral_home_team: null,
                  status: 'completed',
                },
              ],
            },
      'teams.select': { data: [{ id: HAWKS, name: 'Hawks' }] },
      'opponent_teams.select': { data: [] },
      'league_players.select': { data: [] },
      'players.select': { data: [PLAYERS[0]] },
      'game_events.select': { data: [event('g1', 1, 'hit', false, { batterId: 'h1', hitType: 'double' })] },
      'game_lineups.select': { data: [] },
    });

    await recomputeLeagueSnapshot(db as never, LEAGUE, SEASON);

    const season = playerRow(calls, 'season', 'h1', HAWKS);
    const team = playerRow(calls, 'team', 'h1', HAWKS);
    expect(season?.stats).toMatchObject({ hits: 1, doubles: 1 });
    expect(team).toEqual({ ...season, scope: 'team' });
    expect(standing(calls, HAWKS)).toMatchObject({ wins: 1, runs_for: 3 });
  });
});
