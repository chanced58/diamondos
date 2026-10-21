import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureChannelMembership, healMissingTeamMembership } from '../membership-self-heal';

const mockAddToTeamChannels = jest.fn();
jest.mock('@/lib/team-channels', () => ({
  addToTeamChannels: (...args: unknown[]) => mockAddToTeamChannels(...args),
}));

type Write = { table: string; op: 'upsert' | 'update'; values: unknown };

/** Query-builder stand-in: reads return `reads[table]` in order; writes are recorded. */
function fakeDb(reads: Record<string, unknown[]>) {
  const writes: Write[] = [];
  const db = {
    from(table: string) {
      const queue = reads[table] ?? [];
      const data = queue.length > 1 ? queue.shift() : queue[0] ?? null;
      const settled = Promise.resolve({ data, error: null });
      const builder: Record<string, unknown> = {
        then: settled.then.bind(settled),
        maybeSingle: () => settled,
        upsert: (values: unknown) => {
          writes.push({ table, op: 'upsert', values });
          return builder;
        },
        update: (values: unknown) => {
          writes.push({ table, op: 'update', values });
          return builder;
        },
      };
      for (const method of ['select', 'eq', 'in', 'is', 'limit']) builder[method] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, writes };
}

const TEAM = {
  id: 'team-1', name: 'Huskies', organization: null, logo_url: null, primary_color: null, secondary_color: null,
};

beforeEach(() => jest.clearAllMocks());

describe('healMissingTeamMembership', () => {
  it('should make the creator of a team its head coach', async () => {
    const { db, writes } = fakeDb({ teams: [TEAM] });

    const team = await healMissingTeamMembership(db, { id: 'user-1', email: 'c@example.com' });

    expect(team).toEqual(TEAM);
    expect(writes[0]).toEqual({
      table: 'team_members',
      op: 'upsert',
      values: { team_id: 'team-1', user_id: 'user-1', role: 'head_coach', is_active: true },
    });
  });

  it('should restore membership from a pending invite, accept it, and join channels', async () => {
    const { db, writes } = fakeDb({
      teams: [null, TEAM],
      team_invitations: [[
        { id: 'inv-1', team_id: 'team-1', role: 'parent', email: 'p@example.com', first_name: 'Sam', last_name: null, status: 'pending' },
      ]],
      user_profiles: [{ first_name: null, last_name: null, email: 'p@example.com' }],
    });

    const team = await healMissingTeamMembership(db, { id: 'user-2', email: 'P@example.com' });

    expect(team).toEqual(TEAM);
    expect(writes).toContainEqual({
      table: 'team_members',
      op: 'upsert',
      values: { team_id: 'team-1', user_id: 'user-2', role: 'parent', is_active: true },
    });
    expect(writes).toContainEqual(expect.objectContaining({ table: 'team_invitations', op: 'update' }));
    expect(writes).toContainEqual({ table: 'user_profiles', op: 'update', values: { first_name: 'Sam' } });
    expect(mockAddToTeamChannels).toHaveBeenCalledWith(db, 'team-1', 'user-2', 'parent');
  });

  it('should heal nothing without a created team or an invite', async () => {
    const { db, writes } = fakeDb({ teams: [null], team_invitations: [[]] });

    expect(await healMissingTeamMembership(db, { id: 'user-3', email: 'x@example.com' })).toBeUndefined();
    expect(writes).toEqual([]);
  });
});

describe('ensureChannelMembership', () => {
  it('should join team channels only when the user belongs to no channel', async () => {
    const empty = fakeDb({ channel_members: [[]], team_members: [{ role: 'player' }] });
    await ensureChannelMembership(empty.db, 'user-1', ['team-1']);
    expect(mockAddToTeamChannels).toHaveBeenCalledWith(empty.db, 'team-1', 'user-1', 'player');

    mockAddToTeamChannels.mockClear();
    const member = fakeDb({ channel_members: [[{ channel_id: 'ch-1' }]] });
    await ensureChannelMembership(member.db, 'user-1', ['team-1']);
    expect(mockAddToTeamChannels).not.toHaveBeenCalled();
  });
});
