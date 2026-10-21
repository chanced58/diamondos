import type { SupabaseClient } from '@supabase/supabase-js';
import { Feature, SubscriptionTier, meResponseSchema } from '@baseball/shared';
import { featuresForTier, loadMe } from '../load-me';

const mockResolveTeamTier = jest.fn();
const mockHeal = jest.fn();
const mockEnsureChannels = jest.fn();

jest.mock('@/lib/team-tier', () => ({
  resolveTeamTier: (...args: unknown[]) => mockResolveTeamTier(...args),
}));
jest.mock('@/lib/membership-self-heal', () => ({
  healMissingTeamMembership: (...args: unknown[]) => mockHeal(...args),
  ensureChannelMembership: (...args: unknown[]) => mockEnsureChannels(...args),
}));

type TableResults = Record<string, Array<{ data: unknown; error?: { message: string } | null }>>;

/**
 * A chainable stand-in for the Supabase query builder. Each `from(table)`
 * consumes the next queued result for that table, whatever filters are
 * chained onto it.
 */
function fakeDb(results: TableResults) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      calls.push(table);
      const queue = results[table] ?? [];
      const result = queue.length > 1 ? queue.shift()! : queue[0] ?? { data: null };
      const settled = Promise.resolve({ data: result.data, error: result.error ?? null });
      const builder: Record<string, unknown> = {
        then: settled.then.bind(settled),
        maybeSingle: () => settled,
      };
      for (const method of ['select', 'eq', 'in', 'is', 'limit']) builder[method] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const USER = { id: 'user-1', email: 'coach@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveTeamTier.mockResolvedValue(SubscriptionTier.FREE);
});

describe('loadMe', () => {
  it('should return memberships with player ids, tournament flags, tiers and features', async () => {
    mockResolveTeamTier.mockImplementation(async (_db: unknown, teamId: string) =>
      teamId === 'team-a' ? SubscriptionTier.PRO : SubscriptionTier.FREE,
    );
    const { db } = fakeDb({
      team_members: [{
        data: [
          { team_id: 'team-a', role: 'head_coach', teams: { name: 'Huskies', organization: 'North HS' } },
          { team_id: 'team-b', role: 'player', teams: [{ name: 'Summer Classic', organization: null }] },
        ],
      }],
      players: [{ data: [{ id: 'player-9', team_id: 'team-b' }] }],
      tournament_teams: [{ data: [{ team_id: 'team-b' }] }],
      league_staff: [{
        data: [{ league_id: 'league-1', role: 'league_admin', leagues: { name: 'Metro League', slug: 'metro' } }],
      }],
      user_profiles: [{ data: { first_name: 'Pat', last_name: 'Lee' } }],
    });

    const me = await loadMe(db, USER);

    expect(me.memberships).toEqual([
      {
        teamId: 'team-a', teamName: 'Huskies', organization: 'North HS', role: 'head_coach',
        playerId: null, isTournamentTeam: false, tier: SubscriptionTier.PRO,
        features: featuresForTier(SubscriptionTier.PRO),
      },
      {
        teamId: 'team-b', teamName: 'Summer Classic', organization: null, role: 'player',
        playerId: 'player-9', isTournamentTeam: true, tier: SubscriptionTier.FREE, features: [],
      },
    ]);
    expect(me.leagueRoles).toEqual([
      { leagueId: 'league-1', leagueName: 'Metro League', leagueSlug: 'metro', role: 'league_admin' },
    ]);
    expect(me.user).toEqual({ id: 'user-1', email: 'coach@example.com', firstName: 'Pat', lastName: 'Lee' });
    expect(mockHeal).not.toHaveBeenCalled();
    expect(mockEnsureChannels).toHaveBeenCalledWith(db, 'user-1', ['team-a', 'team-b']);
    // The payload satisfies the contract the mobile app parses it with.
    expect(meResponseSchema.parse(me)).toEqual(me);
  });

  it('should self-heal a user with no memberships and return the healed team', async () => {
    mockHeal.mockResolvedValue({ id: 'team-a' });
    const { db } = fakeDb({
      team_members: [
        { data: [] },
        { data: [{ team_id: 'team-a', role: 'parent', teams: { name: 'Huskies', organization: null } }] },
      ],
      user_profiles: [{ data: { is_platform_admin: false } }],
      player_profiles: [{ data: null }],
    });

    const me = await loadMe(db, USER);

    expect(mockHeal).toHaveBeenCalledWith(db, USER);
    expect(me.memberships.map((m) => m.teamId)).toEqual(['team-a']);
  });

  it('should not self-heal platform admins or Player Pro users', async () => {
    for (const gates of [
      { admin: { is_platform_admin: true }, playerProfile: null },
      { admin: { is_platform_admin: false }, playerProfile: { user_id: 'user-1' } },
    ]) {
      mockHeal.mockClear();
      const { db } = fakeDb({
        team_members: [{ data: [] }],
        user_profiles: [{ data: gates.admin }],
        player_profiles: [{ data: gates.playerProfile }],
      });

      const me = await loadMe(db, USER);

      expect(mockHeal).not.toHaveBeenCalled();
      expect(me.memberships).toEqual([]);
    }
  });

  it('should throw when memberships cannot be read', async () => {
    const { db } = fakeDb({ team_members: [{ data: null, error: { message: 'boom' } }] });

    await expect(loadMe(db, USER)).rejects.toThrow('team_members read failed');
  });
});

describe('featuresForTier', () => {
  it('should grant nothing on free and every pro feature on pro', () => {
    expect(featuresForTier(SubscriptionTier.FREE)).toEqual([]);
    expect(featuresForTier(SubscriptionTier.STARTER)).toContain(Feature.DIRECT_MESSAGES);
    expect(featuresForTier(SubscriptionTier.STARTER)).not.toContain(Feature.LEAGUE_MANAGEMENT);
    expect(featuresForTier(SubscriptionTier.PRO)).toContain(Feature.LEAGUE_MANAGEMENT);
  });
});
