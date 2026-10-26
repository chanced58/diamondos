import { cancelInvitation, inviteParent, invitePlayer, inviteStaff, resendInvitation } from '../team-invitations';
import { fakeDb, type FakeCall, type FakeResult } from '../../__tests__/fake-db';

const mockAddToTeamChannels = jest.fn();
jest.mock('@/lib/team-channels', () => ({ addToTeamChannels: (...args: unknown[]) => mockAddToTeamChannels(...args) }));

const TEAM = '11111111-1111-4111-8111-111111111111';
const ACTOR = 'actor';
const ACCOUNT = 'account';
const CHILD = '22222222-2222-4222-8222-222222222222';
const PLAYER = '33333333-3333-4333-8333-333333333333';
const INVITATION = '44444444-4444-4444-8444-444444444444';

type Results = Record<string, FakeResult | ((call: FakeCall) => FakeResult)>;

/**
 * A team the actor coaches. `existing` is the account found for an email (or
 * none), `email` the invite email's outcome.
 */
function setup(results: Results = {}, options: { existing?: boolean; emailError?: unknown; actorRole?: string } = {}) {
  const { 'team_members.select': members, 'user_profiles.select': profiles, ...rest } = results;
  const fake = fakeDb({
    'team_members.select': (call) => {
      if (call.filters.user_id === ACTOR) return { data: { id: 'own', role: options.actorRole ?? 'head_coach' } };
      return typeof members === 'function' ? members(call) : members ?? {};
    },
    'user_profiles.select': (call) => {
      if (call.filters.id === ACTOR) return { data: { is_platform_admin: false } };
      if (call.filters.email) return { data: options.existing ? { id: ACCOUNT, first_name: null, last_name: null } : null };
      return typeof profiles === 'function' ? profiles(call) : profiles ?? { data: { is_platform_admin: false, email: null } };
    },
    ...rest,
  });
  const inviteUserByEmail = jest.fn().mockResolvedValue({ data: {}, error: options.emailError ?? null });
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
  Object.assign(fake.db, { auth: { admin: { inviteUserByEmail } }, rpc });
  return { ...fake, inviteUserByEmail };
}
const writes = (calls: FakeCall[], table: string) => calls.filter((c) => c.table === table && c.op !== 'select');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.APP_URL = 'https://app.example.com';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('inviteStaff', () => {
  it('should be for member managers only', async () => {
    const { db, calls } = fakeDb({
      'team_members.select': { data: { id: 'own', role: 'parent' } },
      'user_profiles.select': { data: { is_platform_admin: false } },
    });
    const inviteUserByEmail = jest.fn();
    Object.assign(db, { auth: { admin: { inviteUserByEmail } }, rpc: jest.fn() });
    expect(await inviteStaff(db, ACTOR, { teamId: TEAM, email: 'a@b.co', role: 'staff' })).toMatchObject({ code: 'forbidden' });
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('should record someone without an email by name', async () => {
    const { db, calls, inviteUserByEmail } = setup();
    expect(await inviteStaff(db, ACTOR, { teamId: TEAM, role: 'scorekeeper', firstName: 'Al' })).toEqual({ ok: true, data: { outcome: 'added' } });
    expect(writes(calls, 'team_invitations')[0].payload).toMatchObject({ team_id: TEAM, role: 'scorekeeper', first_name: 'Al', status: 'pending' });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('should add an existing account at once, unless they are on the team with another role', async () => {
    const added = setup({ 'team_members.select': { data: null } }, { existing: true });
    expect(await inviteStaff(added.db, ACTOR, { teamId: TEAM, email: 'Pat@Example.com', role: 'staff' })).toEqual({ ok: true, data: { outcome: 'added' } });
    expect(writes(added.calls, 'team_members')[0].payload).toMatchObject({ team_id: TEAM, user_id: ACCOUNT, role: 'staff', is_active: true });
    expect(mockAddToTeamChannels).toHaveBeenCalledWith(added.db, TEAM, ACCOUNT, 'staff');

    const coach = setup({ 'team_members.select': { data: { role: 'head_coach', is_active: true } } }, { existing: true });
    expect(await inviteStaff(coach.db, ACTOR, { teamId: TEAM, email: 'pat@example.com', role: 'staff' })).toMatchObject({ code: 'conflict' });
    expect(writes(coach.calls, 'team_members')).toHaveLength(0);

    const unreadable = setup({ 'team_members.select': { error: { message: 'boom' } } }, { existing: true });
    expect(await inviteStaff(unreadable.db, ACTOR, { teamId: TEAM, email: 'pat@example.com', role: 'staff' })).toMatchObject({ code: 'failed' });
    expect(writes(unreadable.calls, 'team_members')).toHaveLength(0);
  });

  it('should refuse to add a platform administrator', async () => {
    const { db } = setup({ 'user_profiles.select': { data: { is_platform_admin: true, email: null } } }, { existing: true });
    expect(await inviteStaff(db, ACTOR, { teamId: TEAM, email: 'admin@example.com', role: 'staff' })).toMatchObject({ code: 'conflict' });
  });

  it('should save a new address’s invitation before emailing it', async () => {
    const { db, calls, inviteUserByEmail } = setup();
    expect(await inviteStaff(db, ACTOR, { teamId: TEAM, email: 'new@example.com', role: 'assistant_coach' })).toEqual({ ok: true, data: { outcome: 'invited' } });
    expect(writes(calls, 'team_invitations')[0].payload).toMatchObject({ email: 'new@example.com', role: 'assistant_coach', status: 'pending' });
    expect(inviteUserByEmail).toHaveBeenCalledWith('new@example.com', {
      data: { invited_to_team: TEAM, invited_role: 'assistant_coach' },
      redirectTo: `https://app.example.com/auth/callback?team=${TEAM}&role=assistant_coach`,
    });
  });

  it('should take the invitation back when the email fails, and say when it was the rate limit', async () => {
    const fresh = setup({}, { emailError: { status: 429, message: 'Too many requests' } });
    expect(await inviteStaff(fresh.db, ACTOR, { teamId: TEAM, email: 'new@example.com', role: 'staff' })).toMatchObject({ code: 'unavailable' });
    expect(writes(fresh.calls, 'team_invitations').map((c) => c.op)).toEqual(['upsert', 'delete']);

    const earlier = { id: 'inv0', first_name: 'Old', last_name: null, phone: null, role: 'staff', jersey_number: null, player_ids: null, invited_by: 'coach0', invited_at: '2026-10-01T00:00:00Z', status: 'cancelled', accepted_at: null };
    const resent = setup({ 'team_invitations.select': { data: earlier } }, { emailError: { message: 'smtp down' } });
    expect(await inviteStaff(resent.db, ACTOR, { teamId: TEAM, email: 'new@example.com', role: 'staff' })).toMatchObject({ code: 'failed' });
    const restore = writes(resent.calls, 'team_invitations').find((c) => c.op === 'update');
    expect(restore).toMatchObject({ filters: { id: 'inv0' }, payload: { status: 'cancelled', first_name: 'Old', invited_by: 'coach0' } });
  });
});

describe('inviteParent', () => {
  it('should need the children with an email, and take them only from this team’s roster', async () => {
    const { db } = setup({ 'players.select': { data: [{ id: CHILD }] } });
    expect(await inviteParent(db, ACTOR, { teamId: TEAM, email: 'pat@example.com', playerIds: [] })).toMatchObject({ code: 'invalid' });
    expect(await inviteParent(db, ACTOR, { teamId: TEAM, email: 'pat@example.com', playerIds: [CHILD, PLAYER] })).toMatchObject({
      code: 'invalid',
      error: 'Pick players from this team’s roster.',
    });
  });

  it('should add an existing account as a parent of the chosen children', async () => {
    const { db, calls } = setup({ 'players.select': { data: [{ id: CHILD }] }, 'team_members.select': { data: null } }, { existing: true });
    expect(await inviteParent(db, ACTOR, { teamId: TEAM, email: 'pat@example.com', playerIds: [CHILD] })).toEqual({ ok: true, data: { outcome: 'added' } });
    expect(writes(calls, 'team_members')[0].payload).toMatchObject({ user_id: ACCOUNT, role: 'parent' });
    expect(writes(calls, 'parent_player_links')[0].payload).toEqual([{ parent_user_id: ACCOUNT, player_id: CHILD }]);
  });

  it('should record the chosen children on a new parent’s invitation and link', async () => {
    const { db, calls, inviteUserByEmail } = setup({ 'players.select': { data: [{ id: CHILD }] } });
    expect(await inviteParent(db, ACTOR, { teamId: TEAM, email: 'pat@example.com', playerIds: [CHILD] })).toEqual({ ok: true, data: { outcome: 'invited' } });
    expect(writes(calls, 'team_invitations')[0].payload).toMatchObject({ role: 'parent', player_ids: [CHILD], status: 'pending' });
    expect(inviteUserByEmail.mock.calls[0][1].redirectTo).toContain(`players=${CHILD}`);
  });
});

describe('invitePlayer', () => {
  const player = (extra = {}) => ({ data: { id: PLAYER, first_name: 'Sam', last_name: 'Lee', email: 'sam@example.com', user_id: null, ...extra } });

  it('should invite at the roster email, recording the player on the invitation', async () => {
    const { db, calls, inviteUserByEmail } = setup({ 'players.select': player() });
    expect(await invitePlayer(db, ACTOR, { teamId: TEAM, playerId: PLAYER })).toEqual({ ok: true, data: { outcome: 'invited' } });
    expect(writes(calls, 'team_invitations')[0].payload).toMatchObject({ email: 'sam@example.com', role: 'player', player_ids: [PLAYER] });
    expect(inviteUserByEmail.mock.calls[0][1].redirectTo).toContain(`player=${PLAYER}`);
  });

  it('should invite at another address when given one, and connect an existing account at once', async () => {
    const { db, calls } = setup({ 'players.select': player({ email: null }), 'team_members.select': { data: null } }, { existing: true });
    expect(await invitePlayer(db, ACTOR, { teamId: TEAM, playerId: PLAYER, email: 'Parent@Example.com' })).toEqual({ ok: true, data: { outcome: 'added' } });
    expect(writes(calls, 'team_members')[0].payload).toMatchObject({ user_id: ACCOUNT, role: 'player' });
    expect(writes(calls, 'players')[0]).toMatchObject({ payload: { user_id: ACCOUNT }, filters: { id: PLAYER, team_id: TEAM, 'user_id is': null } });
  });

  it('should refuse a player who has an account or no email', async () => {
    expect(await invitePlayer(setup({ 'players.select': player({ user_id: 'u9' }) }).db, ACTOR, { teamId: TEAM, playerId: PLAYER })).toMatchObject({ code: 'conflict' });
    expect(await invitePlayer(setup({ 'players.select': player({ email: null }) }).db, ACTOR, { teamId: TEAM, playerId: PLAYER })).toMatchObject({ code: 'invalid' });
    expect(await invitePlayer(setup({ 'players.select': { data: null } }).db, ACTOR, { teamId: TEAM, playerId: PLAYER })).toMatchObject({ code: 'not_found' });
  });
});

describe('resendInvitation and cancelInvitation', () => {
  const pending = (extra = {}) => ({
    data: {
      team_id: TEAM, email: 'pat@example.com', role: 'parent', first_name: 'Pat', last_name: null, phone: null,
      jersey_number: null, player_ids: [CHILD], invited_by: 'coach0', status: 'pending', ...extra,
    },
  });

  it('should send the invitation again as recorded', async () => {
    const { db, inviteUserByEmail, calls } = setup({ 'team_invitations.select': pending() });
    expect(await resendInvitation(db, ACTOR, { teamId: TEAM, invitationId: INVITATION })).toEqual({ ok: true, data: { ok: true } });
    expect(calls.find((c) => c.table === 'team_invitations')?.filters).toEqual({ id: INVITATION, team_id: TEAM });
    expect(inviteUserByEmail).toHaveBeenCalledWith('pat@example.com', expect.objectContaining({ data: { invited_to_team: TEAM, invited_role: 'parent' } }));
    expect(writes(calls, 'team_invitations')[0].payload).toMatchObject({ player_ids: [CHILD], invited_by: 'coach0', status: 'pending' });
  });

  it('should not resend an answered invitation or a record without an email', async () => {
    expect(await resendInvitation(setup({ 'team_invitations.select': pending({ status: 'accepted' }) }).db, ACTOR, { teamId: TEAM, invitationId: INVITATION })).toMatchObject({ code: 'not_found' });
    expect(
      await resendInvitation(setup({ 'team_invitations.select': pending({ email: 'noemail_1@placeholder.internal' }) }).db, ACTOR, { teamId: TEAM, invitationId: INVITATION }),
    ).toMatchObject({ code: 'invalid' });
  });

  it('should cancel only a pending invitation on the team', async () => {
    const { db, calls } = setup({ 'team_invitations.select': { data: { role: 'staff' } }, 'team_invitations.update': { data: [{ id: INVITATION }] } });
    expect(await cancelInvitation(db, ACTOR, { teamId: TEAM, invitationId: INVITATION })).toEqual({ ok: true, data: { ok: true } });
    expect(calls.find((c) => c.table === 'team_invitations')?.filters).toEqual({ id: INVITATION, team_id: TEAM, status: 'pending' });
    expect(writes(calls, 'team_invitations')[0]).toMatchObject({ payload: { status: 'cancelled' }, filters: { id: INVITATION, team_id: TEAM, status: 'pending' } });

    expect(await cancelInvitation(setup({ 'team_invitations.select': { data: null } }).db, ACTOR, { teamId: TEAM, invitationId: INVITATION })).toMatchObject({ code: 'not_found' });
  });
});

describe('the head coach and athletic director roles', () => {
  it('should let only head coaches and ADs invite them', async () => {
    const assistant = setup({}, { actorRole: 'assistant_coach' });
    expect(await inviteStaff(assistant.db, ACTOR, { teamId: TEAM, email: 'new@example.com', role: 'head_coach' })).toMatchObject({ code: 'forbidden' });
    expect(await inviteStaff(assistant.db, ACTOR, { teamId: TEAM, role: 'athletic_director', firstName: 'Al' })).toMatchObject({ code: 'forbidden' });
    expect(assistant.inviteUserByEmail).not.toHaveBeenCalled();
    expect(writes(assistant.calls, 'team_invitations')).toHaveLength(0);

    const ad = setup({}, { actorRole: 'athletic_director' });
    expect(await inviteStaff(ad.db, ACTOR, { teamId: TEAM, email: 'new@example.com', role: 'head_coach' })).toMatchObject({ ok: true });
  });

  it('should not let an assistant replace an open head coach invitation by inviting its address', async () => {
    const open = { 'team_invitations.select': { data: { role: 'head_coach' } } };
    const staff = setup(open, { actorRole: 'assistant_coach' });
    expect(await inviteStaff(staff.db, ACTOR, { teamId: TEAM, email: 'hc@example.com', role: 'scorekeeper' })).toMatchObject({ code: 'forbidden' });
    expect(staff.calls.find((c) => c.table === 'team_invitations')?.filters).toMatchObject({ team_id: TEAM, email: 'hc@example.com' });

    const parent = setup({ ...open, 'players.select': { data: [{ id: CHILD }] } }, { actorRole: 'assistant_coach' });
    expect(await inviteParent(parent.db, ACTOR, { teamId: TEAM, email: 'hc@example.com', playerIds: [CHILD] })).toMatchObject({ code: 'forbidden' });

    const player = setup({ ...open, 'players.select': { data: { id: PLAYER, first_name: 'Sam', last_name: 'Lee', email: null, user_id: null } } }, { actorRole: 'assistant_coach' });
    expect(await invitePlayer(player.db, ACTOR, { teamId: TEAM, playerId: PLAYER, email: 'hc@example.com' })).toMatchObject({ code: 'forbidden' });

    for (const { calls, inviteUserByEmail } of [staff, parent, player]) {
      expect(inviteUserByEmail).not.toHaveBeenCalled();
      expect(writes(calls, 'team_invitations')).toHaveLength(0);
      expect(writes(calls, 'team_members')).toHaveLength(0);
    }

    // A head coach may.
    const headCoach = setup(open);
    expect(await inviteStaff(headCoach.db, ACTOR, { teamId: TEAM, email: 'hc@example.com', role: 'scorekeeper' })).toMatchObject({ ok: true });
  });

  it('should not replace a pending invitation for another role, even for a head coach', async () => {
    const other = setup({ 'team_invitations.select': { data: { role: 'parent', status: 'pending' } } });
    expect(await inviteStaff(other.db, ACTOR, { teamId: TEAM, email: 'pat@example.com', role: 'scorekeeper' })).toMatchObject({ code: 'conflict' });
    expect(other.inviteUserByEmail).not.toHaveBeenCalled();
    expect(writes(other.calls, 'team_invitations')).toHaveLength(0);

    // Inviting the same role again sends it again.
    const same = setup({ 'team_invitations.select': { data: { role: 'scorekeeper', status: 'pending' } } });
    expect(await inviteStaff(same.db, ACTOR, { teamId: TEAM, email: 'pat@example.com', role: 'scorekeeper' })).toMatchObject({ ok: true });
  });

  it('should not let an assistant resend or cancel a head coach invitation', async () => {
    const resend = setup(
      { 'team_invitations.select': { data: { team_id: TEAM, email: 'hc@example.com', role: 'head_coach', status: 'pending', invited_by: 'x' } } },
      { actorRole: 'assistant_coach' },
    );
    expect(await resendInvitation(resend.db, ACTOR, { teamId: TEAM, invitationId: INVITATION })).toMatchObject({ code: 'forbidden' });
    expect(resend.inviteUserByEmail).not.toHaveBeenCalled();

    const cancel = setup({ 'team_invitations.select': { data: { role: 'athletic_director' } } }, { actorRole: 'assistant_coach' });
    expect(await cancelInvitation(cancel.db, ACTOR, { teamId: TEAM, invitationId: INVITATION })).toMatchObject({ code: 'forbidden' });
    expect(writes(cancel.calls, 'team_invitations')).toHaveLength(0);
  });
});
