import { dashboardResponseSchema } from '@baseball/shared';
import { loadDashboard } from '../load-dashboard';
import { fakeDb, type FakeCall } from '../../__tests__/fake-db';

const mockLeagueForTeam = jest.fn();
const mockLeagueTeamIds = jest.fn();
jest.mock('@baseball/database', () => ({
  getLeagueForTeam: (...args: unknown[]) => mockLeagueForTeam(...args),
  getLeagueTeamIds: (...args: unknown[]) => mockLeagueTeamIds(...args),
}));
const mockEventLog = jest.fn();
jest.mock('@/lib/games/fetch-game-event-log', () => ({ fetchGameEventLog: (...args: unknown[]) => mockEventLog(...args) }));
const mockDerive = jest.fn();
jest.mock('@baseball/shared', () => ({
  ...jest.requireActual('@baseball/shared'),
  deriveGameState: (...args: unknown[]) => mockDerive(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const RIVAL = '22222222-2222-4222-8222-222222222222';
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const game = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  team_id: TEAM,
  opponent_name: 'Eagles',
  scheduled_at: soon(2),
  time_zone: 'America/Denver',
  location_type: 'home',
  neutral_home_team: null,
  venue_name: 'Main field',
  ...extra,
});

/** `games` is read three ways; answer each by its status filter. */
function gamesBy(byStatus: Record<string, unknown[]>) {
  return (call: FakeCall) => ({ data: byStatus[call.filters.status as string] ?? [] });
}

function dashboardDb(overrides: Record<string, unknown> = {}) {
  return fakeDb({
    // Read twice: the viewer's admin flag, then the announcement senders' names.
    'user_profiles.select': (call: FakeCall) =>
      Array.isArray(call.filters.id) ? { data: [{ id: 'coach', first_name: 'Pat', last_name: 'Lee' }] } : { data: { is_platform_admin: false } },
    'team_members.select': { data: { role: 'parent' } },
    'teams.select': { data: { name: 'Huskies' } },
    'games.select': gamesBy({
      scheduled: [game('next'), game('later', { scheduled_at: soon(9), location_type: 'away', venue_name: null })],
      in_progress: [game('live', { location_type: 'away' })],
      completed: [
        game('w', { home_score: 5, away_score: 2, completed_at: soon(-1) }),
        game('l', { location_type: 'away', home_score: 7, away_score: 1, completed_at: soon(-3) }),
      ],
    }),
    'practices.select': { data: [{ id: 'p1', scheduled_at: soon(1), location: null, duration_minutes: 90 }] },
    'team_events.select': { data: [{ id: 'e1', title: 'Team dinner', event_type: 'other', starts_at: soon(5) }] },
    'channels.select': { data: [{ id: 'ann', name: 'Announcements' }] },
    'messages.select': { data: [{ id: 'm1', body: 'Bring water', created_at: soon(-1), channel_id: 'ann', sender_id: 'coach' }] },
    ...overrides,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLeagueForTeam.mockResolvedValue(null);
  mockEventLog.mockResolvedValue({ data: [], error: null });
  mockDerive.mockReturnValue({ homeScore: 4, awayScore: 1, inning: 5, isTopOfInning: false, outs: 2 });
});

describe('loadDashboard', () => {
  it("should assemble the team's dashboard for any member", async () => {
    const { db } = dashboardDb();
    const result = await loadDashboard(db, 'parent', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);
    const data = dashboardResponseSchema.parse(result.data);

    expect(data).toMatchObject({ teamName: 'Huskies', view: 'team', league: null });
    // Away: our runs are the away score.
    expect(data.liveGames).toEqual([
      expect.objectContaining({ id: 'live', teamName: 'Huskies', isHome: false, ourScore: 1, theirScore: 4, inning: 5, outs: 2 }),
    ]);
    expect(data.nextGame).toMatchObject({ id: 'next', isHome: true, venueName: 'Main field' });
    expect(data.upcoming.map((i) => `${i.kind}:${i.label}`)).toEqual(['practice:Practice', 'game:vs Eagles', 'event:Team dinner', 'game:@ Eagles']);
    expect(data.upcoming[0].sublabel).toBe('90 min');
    expect(data.record).toEqual({ wins: 1, losses: 1, runsFor: 6, runsAgainst: 9 });
    expect(data.announcements).toEqual([expect.objectContaining({ body: 'Bring water', senderName: 'Pat Lee', channelName: 'Announcements' })]);
    // A parent reads announcements but can't post them.
    expect(data.announcementChannelId).toBeNull();
  });

  it('should give coaches the announcement channel to post in', async () => {
    const { db } = dashboardDb({ 'team_members.select': { data: { role: 'assistant_coach' } } });
    const result = await loadDashboard(db, 'coach', { teamId: TEAM });
    expect(result).toMatchObject({ ok: true, data: { announcementChannelId: 'ann' } });
  });

  it("should widen games to the league's teams in the league view", async () => {
    mockLeagueForTeam.mockResolvedValue({ id: 'league', name: 'Valley League' });
    mockLeagueTeamIds.mockResolvedValue([TEAM, RIVAL]);
    const { db, calls } = dashboardDb({
      'teams.select': [{ data: { name: 'Huskies' } }, { data: [{ id: TEAM, name: 'Huskies' }, { id: RIVAL, name: 'Rams' }] }],
      'games.select': gamesBy({ completed: [game('rival', { team_id: RIVAL, home_score: 3, away_score: 3 })] }),
    });
    const result = await loadDashboard(db, 'parent', { teamId: TEAM, view: 'league' });
    if (!result.ok) throw new Error(result.error);

    expect(result.data).toMatchObject({ view: 'league', league: { id: 'league', name: 'Valley League' } });
    expect(result.data.recentGames[0].opponent).toBe('Rams: Eagles');
    const gameReads = calls.filter((c) => c.table === 'games');
    expect(gameReads.every((c) => (c.filters.team_id as string[]).includes(RIVAL))).toBe(true);
    // Practices stay the team's own.
    expect(calls.find((c) => c.table === 'practices')?.filters).toMatchObject({ team_id: TEAM });
  });

  it('should fall back to the team view without a league', async () => {
    const { db } = dashboardDb();
    expect(await loadDashboard(db, 'parent', { teamId: TEAM, view: 'league' })).toMatchObject({ ok: true, data: { view: 'team' } });
    expect(mockLeagueTeamIds).not.toHaveBeenCalled();
  });

  it("should hide a team the viewer isn't on, and hide a failure's detail", async () => {
    expect(await loadDashboard(dashboardDb({ 'team_members.select': { data: null } }).db, 'x', { teamId: TEAM })).toMatchObject({ ok: false, code: 'not_found' });

    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockEventLog.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await loadDashboard(dashboardDb().db, 'parent', { teamId: TEAM })).toEqual({ ok: false, code: 'failed', error: 'Something went wrong. Please try again.' });
  });
});
