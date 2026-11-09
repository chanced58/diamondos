import {
  canResolvePlaceholder,
  createLeagueRosterPlayer,
  listUnmatchedPlaceholders,
  resolvePlaceholder,
} from '../placeholders';
import { fakeDb, type FakeResult } from '../../__tests__/fake-db';

const mockRefreshLeagueGame = jest.fn();
jest.mock('@/lib/league-games/refresh', () => ({
  refreshLeagueGame: (...args: unknown[]) => mockRefreshLeagueGame(...args),
}));

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const HOME = '22222222-2222-4222-8222-222222222222';
const AWAY = '33333333-3333-4333-8333-333333333333';
const HOME_RECORD = '44444444-4444-4444-8444-444444444444';
const LEAGUE_GAME = '66666666-6666-4666-8666-666666666666';
const PLACEHOLDER = '77777777-7777-4777-8777-777777777777';
const PLAYER = '88888888-8888-4888-8888-888888888888';
const NEW_PLAYER = '99999999-9999-4999-8999-999999999999';
const ACTOR = 'actor-1';

// The placeholder plays for HOME (its record is Hawks'), so AWAY scored against it.
const placeholderRow = {
  id: PLACEHOLDER,
  first_name: 'Unknown',
  last_name: '#7',
  jersey_number: '7',
  opponent_team_id: HOME_RECORD,
  placeholder_game_id: LEAGUE_GAME,
  linked_player_id: null,
  is_fill_in: false,
};
const leagueGame = {
  id: LEAGUE_GAME,
  league_id: LEAGUE,
  home_team_id: HOME,
  away_team_id: AWAY,
  scheduled_at: '2026-11-10T02:00:00Z',
  time_zone: 'America/Boise',
};

/** The actor's league seats and team roles. */
function actor(opts: { leagueRole?: string; teams?: Record<string, string> } = {}): Record<string, FakeResult> {
  return {
    'league_staff.select': { data: opts.leagueRole ? [{ league_id: LEAGUE, role: opts.leagueRole }] : [] },
    'team_members.select': { data: Object.entries(opts.teams ?? {}).map(([team_id, role]) => ({ team_id, role })) },
  };
}

function fixture(who: Parameters<typeof actor>[0], extra: Record<string, FakeResult | FakeResult[]> = {}) {
  return fakeDb({
    'opponent_players.select': { data: placeholderRow },
    'opponent_teams.select': { data: [{ id: HOME_RECORD, linked_team_id: HOME }] },
    'league_games.select': { data: [leagueGame] },
    'players.select': { data: { id: PLAYER, team_id: HOME } },
    'opponent_players.update': { data: [{ id: PLACEHOLDER }] },
    ...actor(who),
    ...extra,
  });
}

beforeEach(() => {
  mockRefreshLeagueGame.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('resolvePlaceholder', () => {
  it('should link a placeholder to a player and refresh the league', async () => {
    const { db, calls } = fixture({ leagueRole: 'league_admin' });
    const result = await resolvePlaceholder(db, ACTOR, { action: 'link', placeholderId: PLACEHOLDER, playerId: PLAYER });
    expect(result).toEqual({ ok: true, data: { playerId: PLAYER } });
    const update = calls.find((c) => c.table === 'opponent_players' && c.op === 'update');
    expect(update?.payload).toMatchObject({ linked_player_id: PLAYER, is_fill_in: false });
    expect(update?.filters).toEqual({ id: PLACEHOLDER });
    expect(mockRefreshLeagueGame).toHaveBeenCalledWith(db, LEAGUE_GAME, ACTOR);
  });

  it('should refuse to link a player from another team', async () => {
    const { db, calls } = fixture(
      { leagueRole: 'league_admin' },
      { 'players.select': { data: { id: PLAYER, team_id: AWAY } }, 'player_team_memberships.select': { data: null } },
    );
    const result = await resolvePlaceholder(db, ACTOR, { action: 'link', placeholderId: PLACEHOLDER, playerId: PLAYER });
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
    expect(calls.some((c) => c.op === 'update')).toBe(false);
    expect(mockRefreshLeagueGame).not.toHaveBeenCalled();
  });

  it('should link a player who has played for the team', async () => {
    const { db } = fixture(
      { leagueRole: 'league_admin' },
      { 'players.select': { data: { id: PLAYER, team_id: AWAY } }, 'player_team_memberships.select': { data: { player_id: PLAYER } } },
    );
    const result = await resolvePlaceholder(db, ACTOR, { action: 'link', placeholderId: PLACEHOLDER, playerId: PLAYER });
    expect(result).toEqual({ ok: true, data: { playerId: PLAYER } });
  });

  it('should create a roster player from a placeholder', async () => {
    const { db, calls } = fixture(
      { leagueRole: 'league_admin' },
      { 'players.insert': { data: { id: NEW_PLAYER } } },
    );
    const result = await resolvePlaceholder(db, ACTOR, {
      action: 'create', placeholderId: PLACEHOLDER, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7,
    });
    expect(result).toEqual({ ok: true, data: { playerId: NEW_PLAYER } });
    expect(calls.find((c) => c.table === 'players' && c.op === 'insert')?.payload).toEqual({
      team_id: HOME, first_name: 'Sam', last_name: 'Lee', jersey_number: 7,
    });
    expect(calls.find((c) => c.table === 'opponent_players' && c.op === 'update')?.payload).toMatchObject({ linked_player_id: NEW_PLAYER });
    expect(mockRefreshLeagueGame).toHaveBeenCalledTimes(1);
  });

  it('should report a taken jersey number as a conflict', async () => {
    const { db, calls } = fixture(
      { leagueRole: 'league_admin' },
      { 'players.insert': { data: { id: NEW_PLAYER } }, 'player_team_memberships.insert': { error: { code: '23505', message: 'dup' } } },
    );
    const result = await resolvePlaceholder(db, ACTOR, {
      action: 'create', placeholderId: PLACEHOLDER, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7,
    });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    expect(calls.some((c) => c.table === 'opponent_players' && c.op === 'update')).toBe(false);
    expect(mockRefreshLeagueGame).not.toHaveBeenCalled();
  });

  it('should mark a placeholder as a fill-in', async () => {
    const { db, calls } = fixture({ teams: { [AWAY]: 'scorekeeper' } });
    const result = await resolvePlaceholder(db, ACTOR, { action: 'fill_in', placeholderId: PLACEHOLDER });
    expect(result).toEqual({ ok: true, data: { playerId: null } });
    expect(calls.find((c) => c.table === 'opponent_players' && c.op === 'update')?.payload).toMatchObject({ is_fill_in: true });
  });

  it("should let the placeholder's own team coach match it", async () => {
    const { db } = fixture({ teams: { [HOME]: 'head_coach' } });
    const result = await resolvePlaceholder(db, ACTOR, { action: 'link', placeholderId: PLACEHOLDER, playerId: PLAYER });
    expect(result.ok).toBe(true);
  });

  it('should let the scoring team coach match it', async () => {
    const { db } = fixture({ teams: { [AWAY]: 'assistant_coach' } });
    expect(await canResolvePlaceholder(db, ACTOR, PLACEHOLDER)).toBe(true);
  });

  it('should refuse a coach from an unrelated team', async () => {
    const { db, calls } = fixture({ teams: { 'other-team': 'head_coach' } });
    const result = await resolvePlaceholder(db, ACTOR, { action: 'fill_in', placeholderId: PLACEHOLDER });
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    expect(calls.some((c) => c.op === 'update')).toBe(false);
    expect(await canResolvePlaceholder(db, ACTOR, PLACEHOLDER)).toBe(false);
  });

  it("should refuse the placeholder's own team scorekeeper", async () => {
    const { db } = fixture({ teams: { [HOME]: 'scorekeeper' } });
    expect(await canResolvePlaceholder(db, ACTOR, PLACEHOLDER)).toBe(false);
  });

  it('should refuse a placeholder that is already matched', async () => {
    const { db } = fixture(
      { leagueRole: 'league_admin' },
      { 'opponent_players.select': { data: { ...placeholderRow, linked_player_id: PLAYER } } },
    );
    const result = await resolvePlaceholder(db, ACTOR, { action: 'fill_in', placeholderId: PLACEHOLDER });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('should report an unknown placeholder as not found', async () => {
    const { db } = fixture({ leagueRole: 'league_admin' }, { 'opponent_players.select': { data: null } });
    const result = await resolvePlaceholder(db, ACTOR, { action: 'fill_in', placeholderId: PLACEHOLDER });
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('createLeagueRosterPlayer', () => {
  const input = { leagueId: LEAGUE, teamId: HOME, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 };

  it('should add the player, an active membership and the league registration', async () => {
    const { db, calls } = fakeDb({ 'players.insert': { data: { id: NEW_PLAYER } } });
    expect(await createLeagueRosterPlayer(db, input)).toEqual({ ok: true, data: { playerId: NEW_PLAYER } });
    expect(calls.find((c) => c.table === 'player_team_memberships')?.payload).toEqual({
      player_id: NEW_PLAYER, team_id: HOME, jersey_number: 7, is_active: true,
    });
    expect(calls.find((c) => c.table === 'league_players')?.payload).toEqual({ league_id: LEAGUE, player_id: NEW_PLAYER });
  });

  it('should return a conflict and remove the player when the jersey number is taken', async () => {
    const { db, calls } = fakeDb({
      'players.insert': { data: { id: NEW_PLAYER } },
      'player_team_memberships.insert': { error: { code: '23505', message: 'dup' } },
    });
    expect(await createLeagueRosterPlayer(db, input)).toMatchObject({ ok: false, code: 'conflict' });
    expect(calls.find((c) => c.table === 'players' && c.op === 'delete')?.filters).toEqual({ id: NEW_PLAYER, team_id: HOME });
    expect(calls.some((c) => c.table === 'league_players')).toBe(false);
  });

  it('should undo the player and membership when the league registration fails', async () => {
    const { db, calls } = fakeDb({
      'players.insert': { data: { id: NEW_PLAYER } },
      'league_players.insert': { error: { message: 'boom' } },
    });
    expect(await createLeagueRosterPlayer(db, input)).toMatchObject({ ok: false, code: 'failed' });
    expect(calls.some((c) => c.table === 'player_team_memberships' && c.op === 'delete')).toBe(true);
    expect(calls.some((c) => c.table === 'players' && c.op === 'delete')).toBe(true);
  });
});

describe('listUnmatchedPlaceholders', () => {
  const listFixture = (who: NonNullable<Parameters<typeof actor>[0]>, rows = [placeholderRow]) =>
    fakeDb({
      'league_staff.select': (call) =>
        call.filters.league_id
          ? { data: who.leagueRole ? { role: who.leagueRole, leagues: { id: LEAGUE, name: 'Valley' } } : null }
          : { data: who.leagueRole ? [{ league_id: LEAGUE, role: who.leagueRole }] : [] },
      'team_members.select': { data: Object.entries(who.teams ?? {}).map(([team_id, role]) => ({ team_id, role })) },
      // One game by id is read singly, a league's games as a list.
      'league_games.select': (call) => ({ data: typeof call.filters.id === 'string' ? leagueGame : [leagueGame] }),
      'opponent_players.select': { data: rows },
      'opponent_teams.select': { data: [{ id: HOME_RECORD, linked_team_id: HOME }] },
      'teams.select': { data: [{ id: HOME, name: 'Hawks' }, { id: AWAY, name: 'Bears' }] },
    });

  it('should list a league\'s placeholders for staff, marking who can match them', async () => {
    const { db, calls } = listFixture({ leagueRole: 'league_manager' });
    const result = await listUnmatchedPlaceholders(db, ACTOR, { leagueId: LEAGUE });
    expect(result).toEqual({
      ok: true,
      data: {
        placeholders: [
          {
            id: PLACEHOLDER, leagueGameId: LEAGUE_GAME, gameLabel: 'Bears at Hawks, Nov 9', teamId: HOME, teamName: 'Hawks',
            label: 'Unknown #7', jerseyNumber: '7', canResolve: false,
          },
        ],
      },
    });
    const read = calls.find((c) => c.table === 'opponent_players');
    expect(read?.filters).toMatchObject({ 'linked_player_id is': null, is_fill_in: false });
  });

  it('should hide fill-ins from the unmatched list', async () => {
    const { db, calls } = listFixture({ leagueRole: 'league_admin' }, []);
    const result = await listUnmatchedPlaceholders(db, ACTOR, { leagueId: LEAGUE });
    expect(result).toEqual({ ok: true, data: { placeholders: [] } });
    expect(calls.find((c) => c.table === 'opponent_players')?.filters).toMatchObject({ is_fill_in: false, 'linked_player_id is': null });
  });

  it("should list one game's placeholders for a coach of either team", async () => {
    const { db } = listFixture({ teams: { [AWAY]: 'head_coach' } });
    const result = await listUnmatchedPlaceholders(db, ACTOR, { leagueGameId: LEAGUE_GAME });
    expect(result).toMatchObject({ ok: true, data: { placeholders: [{ id: PLACEHOLDER, canResolve: true }] } });
  });

  it('should not show a game to someone outside it', async () => {
    const { db } = listFixture({ teams: { 'other-team': 'head_coach' } });
    expect(await listUnmatchedPlaceholders(db, ACTOR, { leagueGameId: LEAGUE_GAME })).toMatchObject({ ok: false, code: 'not_found' });
  });
});
