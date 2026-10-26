import { linkParent, loadTeamMembers, removeMember, unlinkParent, updateMemberRole } from '../team-members';
import { fakeDb, type FakeCall } from '../../__tests__/fake-db';

const mockCancelInvitations = jest.fn();
jest.mock('@/lib/membership-self-heal', () => ({
  cancelTeamInvitationsForUser: (...args: unknown[]) => mockCancelInvitations(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const ACTOR = 'actor';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const OWN_MEMBER = '33333333-3333-4333-8333-333333333333';
const PARENT = '44444444-4444-4444-8444-444444444444';
const CHILD = '55555555-5555-4555-8555-555555555555';

/** Results for a team where the actor is `role` (own membership OWN_MEMBER), plus `extra`. */
function team(role: string | null, extra: Record<string, unknown> = {}) {
  return fakeDb({
    'user_profiles.select': (call: FakeCall) =>
      call.filters.id === ACTOR ? { data: { is_platform_admin: false } } : (extra['user_profiles.select'] as object) ?? { data: [] },
    'team_members.select': (call: FakeCall) => {
      if (call.filters.user_id === ACTOR) return { data: role ? { id: OWN_MEMBER, role } : null };
      const handler = extra['team_members.select'];
      return typeof handler === 'function' ? handler(call) : (handler as object) ?? {};
    },
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'user_profiles.select' && key !== 'team_members.select')),
  } as Parameters<typeof fakeDb>[0]);
}
const writes = (calls: FakeCall[], table: string) => calls.filter((c) => c.table === table && c.op !== 'select');

beforeEach(() => jest.clearAllMocks());

describe('authorization', () => {
  it('should refuse team members who don’t manage it, and hide the team from strangers', async () => {
    expect(await loadTeamMembers(team('parent').db, ACTOR, { teamId: TEAM })).toMatchObject({ code: 'forbidden' });
    expect(await loadTeamMembers(team(null).db, ACTOR, { teamId: TEAM })).toMatchObject({ code: 'not_found' });
  });
});

describe('loadTeamMembers', () => {
  it('should list staff, parents with their children here, player accounts and pending invitations', async () => {
    const { db } = team('head_coach', {
      'team_members.select': {
        data: [
          { id: OWN_MEMBER, role: 'head_coach', user_id: ACTOR },
          { id: MEMBER, role: 'scorekeeper', user_id: 'scorer' },
          { id: 'm-parent', role: 'parent', user_id: PARENT },
          { id: 'm-player', role: 'player', user_id: 'kid' },
        ],
      },
      'players.select': {
        data: [
          { id: CHILD, first_name: 'Sam', last_name: 'Lee', jersey_number: 7, email: 'sam@example.com', user_id: null },
          { id: 'p2', first_name: 'Bo', last_name: 'Diaz', jersey_number: null, email: 'bo@example.com', user_id: null },
        ],
      },
      'team_invitations.select': {
        data: [
          { id: 'inv1', email: 'parent@example.com', first_name: 'Sam', last_name: 'Lee', role: 'player', invited_at: '2026-10-20T00:00:00Z', player_ids: [CHILD] },
          { id: 'inv2', email: 'noemail_1@placeholder.internal', first_name: 'Al', last_name: null, role: 'staff', invited_at: '2026-10-19T00:00:00Z', player_ids: null },
          // A parent invited at Bo's roster address doesn't make Bo's invite pending.
          { id: 'inv3', email: 'bo@example.com', first_name: 'Ma', last_name: 'Diaz', role: 'parent', invited_at: '2026-10-18T00:00:00Z', player_ids: ['p9'] },
        ],
      },
      'user_profiles.select': {
        data: [
          { id: ACTOR, first_name: 'Cy', last_name: 'Young', email: 'cy@example.com', phone: null },
          { id: 'scorer', first_name: 'Ann', last_name: 'Abel', email: null, phone: null },
          { id: PARENT, first_name: 'Pat', last_name: 'Lee', email: 'pat@example.com', phone: '555' },
        ],
      },
      'parent_player_links.select': { data: [{ parent_user_id: PARENT, player_id: CHILD }] },
    });
    const result = await loadTeamMembers(db, ACTOR, { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);

    expect(result.data.ownMemberId).toBe(OWN_MEMBER);
    expect(result.data.staff.map((m) => m.lastName)).toEqual(['Abel', 'Young']);
    expect(result.data.parents).toEqual([expect.objectContaining({ userId: PARENT, children: [{ playerId: CHILD, name: 'Sam Lee' }] })]);
    // Sam's invitation went to a parent's address but records Sam.
    expect(result.data.players).toEqual([
      expect.objectContaining({ playerId: CHILD, hasAccount: false, invitePending: true }),
      expect.objectContaining({ playerId: 'p2', hasAccount: false, invitePending: false }),
    ]);
    expect(result.data.invitations.map((i) => i.email)).toEqual(['parent@example.com', null, 'bo@example.com']);
  });
});

describe('updateMemberRole and removeMember', () => {
  it('should change another member’s role on the team', async () => {
    const { db, calls } = team('assistant_coach', { 'team_members.select': { data: { id: MEMBER, role: 'staff', user_id: 'u2' } } });
    expect(await updateMemberRole(db, ACTOR, { teamId: TEAM, memberId: MEMBER, role: 'scorekeeper' })).toEqual({ ok: true, data: { ok: true } });
    expect(writes(calls, 'team_members')[0]).toMatchObject({ payload: { role: 'scorekeeper' }, filters: { id: MEMBER, team_id: TEAM } });
  });

  it('should reject a role outside the team_role enum and the actor’s own membership', async () => {
    const { db, calls } = team('head_coach');
    expect(await updateMemberRole(db, ACTOR, { teamId: TEAM, memberId: MEMBER, role: 'owner' })).toMatchObject({ code: 'invalid' });
    expect(await updateMemberRole(db, ACTOR, { teamId: TEAM, memberId: OWN_MEMBER, role: 'staff' })).toMatchObject({ code: 'conflict' });
    expect(await removeMember(db, ACTOR, { teamId: TEAM, memberId: OWN_MEMBER })).toMatchObject({ code: 'conflict' });
    expect(writes(calls, 'team_members')).toHaveLength(0);
  });

  it('should say not found for a member of another team', async () => {
    const { db } = team('head_coach', { 'team_members.select': { data: null } });
    expect(await removeMember(db, ACTOR, { teamId: TEAM, memberId: MEMBER })).toMatchObject({ code: 'not_found' });
  });

  it('should take a member off the team and cancel their invitations', async () => {
    const { db, calls } = team('head_coach', { 'team_members.select': { data: { id: MEMBER, role: 'staff', user_id: 'u2' } } });
    expect(await removeMember(db, ACTOR, { teamId: TEAM, memberId: MEMBER })).toMatchObject({ ok: true });
    expect(writes(calls, 'team_members')[0]).toMatchObject({ payload: { is_active: false }, filters: { id: MEMBER, team_id: TEAM } });
    expect(mockCancelInvitations).toHaveBeenCalledWith(db, TEAM, 'u2');
  });
});

describe('linkParent and unlinkParent', () => {
  it('should link a parent on the team to a player on its roster', async () => {
    const { db, calls } = team('head_coach', {
      'team_members.select': { data: { id: 'm-parent' } },
      'players.select': { data: { id: CHILD } },
    });
    expect(await linkParent(db, ACTOR, { teamId: TEAM, parentUserId: PARENT, playerId: CHILD })).toMatchObject({ ok: true });
    expect(calls.find((c) => c.table === 'team_members' && c.filters.user_id === PARENT)?.filters).toMatchObject({ team_id: TEAM, role: 'parent', is_active: true });
    expect(writes(calls, 'parent_player_links')[0].payload).toEqual({ parent_user_id: PARENT, player_id: CHILD });
  });

  it('should not link across teams', async () => {
    const strangerParent = team('head_coach', { 'team_members.select': { data: null }, 'players.select': { data: { id: CHILD } } });
    expect(await linkParent(strangerParent.db, ACTOR, { teamId: TEAM, parentUserId: PARENT, playerId: CHILD })).toMatchObject({ code: 'not_found' });

    const otherTeamsChild = team('head_coach', { 'team_members.select': { data: { id: 'm-parent' } }, 'players.select': { data: null } });
    expect(await linkParent(otherTeamsChild.db, ACTOR, { teamId: TEAM, parentUserId: PARENT, playerId: CHILD })).toMatchObject({ code: 'not_found' });
    expect(writes(otherTeamsChild.calls, 'parent_player_links')).toHaveLength(0);
  });

  it('should unlink only a child on this team’s roster', async () => {
    const here = team('head_coach', { 'players.select': { data: { id: CHILD } } });
    expect(await unlinkParent(here.db, ACTOR, { teamId: TEAM, parentUserId: PARENT, playerId: CHILD })).toMatchObject({ ok: true });
    expect(writes(here.calls, 'parent_player_links')[0]).toMatchObject({ op: 'delete', filters: { parent_user_id: PARENT, player_id: CHILD } });

    const elsewhere = team('head_coach', { 'players.select': { data: null } });
    expect(await unlinkParent(elsewhere.db, ACTOR, { teamId: TEAM, parentUserId: PARENT, playerId: CHILD })).toMatchObject({ code: 'not_found' });
    expect(writes(elsewhere.calls, 'parent_player_links')).toHaveLength(0);
  });
});
