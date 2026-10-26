import type { User } from '@supabase/supabase-js';
import { acceptInvitation } from '../process-invite';
import { fakeDb, type FakeCall } from '../../services/__tests__/fake-db';

const mockAddToTeamChannels = jest.fn();
jest.mock('@/lib/team-channels', () => ({
  addToTeamChannels: (...args: unknown[]) => mockAddToTeamChannels(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';
const OTHER_TEAM_PLAYER = '33333333-3333-4333-8333-333333333333';
const user = { id: 'u1', email: 'New.Coach@Example.com' } as User;
const writes = (calls: FakeCall[], table: string) => calls.filter((c) => c.table === table && c.op !== 'select');
const pendingInvite = (role: string) => ({ 'team_invitations.select': { data: { id: 'inv1', role, first_name: 'Ana', last_name: 'Ruiz' } } });
const accept = (db: ReturnType<typeof fakeDb>['db'], extra: { playerId?: string | null; playersParam?: string | null } = {}) =>
  acceptInvitation(db, user, { teamId: TEAM, playerId: extra.playerId ?? null, playersParam: extra.playersParam ?? null });

beforeEach(() => jest.clearAllMocks());

describe('acceptInvitation', () => {
  it('should grant nothing without a pending invitation for the user’s email on the team', async () => {
    const { db, calls } = fakeDb({});
    await accept(db);

    expect(calls[0]).toMatchObject({ table: 'team_invitations', filters: { team_id: TEAM, email: 'new.coach@example.com', status: 'pending' } });
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    expect(mockAddToTeamChannels).not.toHaveBeenCalled();
  });

  it('should join with the invitation’s role, whatever the link said, and mark it accepted', async () => {
    const { db, calls } = fakeDb(pendingInvite('assistant_coach'));
    await accept(db);

    expect(writes(calls, 'team_members')[0].payload).toEqual({ team_id: TEAM, user_id: 'u1', role: 'assistant_coach', is_active: true });
    expect(mockAddToTeamChannels).toHaveBeenCalledWith(db, TEAM, 'u1', 'assistant_coach');
    expect(writes(calls, 'team_invitations')[0]).toMatchObject({ payload: { status: 'accepted' }, filters: { id: 'inv1' } });
    expect(writes(calls, 'user_profiles')[0].payload).toEqual({ email: 'New.Coach@Example.com', first_name: 'Ana', last_name: 'Ruiz' });
  });

  it('should claim only the unclaimed player with the user’s email on the team', async () => {
    const { db, calls } = fakeDb(pendingInvite('player'));
    await accept(db, { playerId: CHILD });

    const claim = writes(calls, 'players')[0];
    expect(claim.payload).toEqual({ user_id: 'u1' });
    expect(claim.filters).toEqual({ team_id: TEAM, email: 'new.coach@example.com', 'user_id is': null, id: CHILD });
  });

  it('should link a parent only to active players on the invited team', async () => {
    const { db, calls } = fakeDb({ ...pendingInvite('parent'), 'players.select': { data: [{ id: CHILD }] } });
    await accept(db, { playersParam: `${CHILD},${OTHER_TEAM_PLAYER},not-a-uuid` });

    const lookup = calls.find((c) => c.table === 'players');
    expect(lookup?.filters).toEqual({ team_id: TEAM, is_active: true, id: [CHILD, OTHER_TEAM_PLAYER] });
    expect(writes(calls, 'parent_player_links')[0].payload).toEqual([{ parent_user_id: 'u1', player_id: CHILD }]);
  });

  it('should not claim players or link children for a coach invitation', async () => {
    const { db, calls } = fakeDb(pendingInvite('head_coach'));
    await accept(db, { playerId: CHILD, playersParam: CHILD });
    expect(calls.some((c) => c.table === 'players')).toBe(false);
    expect(calls.some((c) => c.table === 'parent_player_links')).toBe(false);
  });
});
