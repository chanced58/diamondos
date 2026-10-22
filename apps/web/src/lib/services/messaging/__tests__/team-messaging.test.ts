import { SubscriptionTier, channelDetailResponseSchema, dmCandidatesResponseSchema } from '@baseball/shared';
import {
  createTeamChannel,
  deleteChannel,
  deleteMessage,
  listDmCandidates,
  loadChannel,
  startDirectMessage,
} from '../team-messaging';
import { fakeDb } from '../../__tests__/fake-db';

const mockResolveTeamTier = jest.fn();
jest.mock('@/lib/team-tier', () => ({ resolveTeamTier: (...args: unknown[]) => mockResolveTeamTier(...args) }));

const TEAM = '11111111-1111-4111-8111-111111111111';
const CHANNEL = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

const role = (r: string) => ({ data: { role: r } });

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveTeamTier.mockResolvedValue(SubscriptionTier.PRO);
});

describe('loadChannel', () => {
  it("should give a member the channel, a DM named for the other person, and mark it read", async () => {
    const { db, calls } = fakeDb({
      'channel_members.select': { data: { can_post: true } },
      'channels.select': {
        data: {
          id: CHANNEL, team_id: TEAM, channel_type: 'direct', name: null, description: null,
          channel_members: [
            { user_id: 'me', user_profiles: { first_name: 'Me', last_name: 'Self' } },
            { user_id: OTHER, user_profiles: { first_name: 'Ann', last_name: 'Coit' } },
          ],
        },
      },
      'team_members.select': [role('parent'), { data: [{ user_id: 'me', role: 'parent' }, { user_id: OTHER, role: 'head_coach' }] }],
    });
    const result = await loadChannel(db, 'me', { channelId: CHANNEL });
    if (!result.ok) throw new Error(result.error);

    expect(channelDetailResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data).toMatchObject({
      channel: { displayName: 'Ann Coit', channelType: 'direct' },
      canPost: true,
      isCoach: false,
      canDeleteChannel: false,
      memberRoles: { me: 'parent', [OTHER]: 'head_coach' },
    });
    const read = calls.find((c) => c.table === 'channel_members' && c.op === 'update')!;
    expect(read.filters).toEqual({ channel_id: CHANNEL, user_id: 'me' });
    expect(read.payload).toHaveProperty('last_read_at');
  });

  it('should hide a channel from someone who is not in it', async () => {
    const { db } = fakeDb({ 'channel_members.select': { data: null } });
    expect(await loadChannel(db, 'stranger', { channelId: CHANNEL })).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('deleteMessage', () => {
  const message = (senderId: string) => ({
    'messages.select': { data: { sender_id: senderId, channel_id: CHANNEL, channels: { team_id: TEAM } } },
  });

  it('should let the sender soft-delete their own message', async () => {
    const { db, calls } = fakeDb(message('me'));
    expect(await deleteMessage(db, 'me', { messageId: MESSAGE })).toEqual({ ok: true, data: { messageId: MESSAGE } });
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.filters).toEqual({ id: MESSAGE });
    expect(update.payload).toMatchObject({ body: '' });
    expect(calls.find((c) => c.table === 'messages' && c.op === 'select')?.filters).toMatchObject({ 'deleted_at is': null });
  });

  it("should let a coach delete anyone's message, and no one else", async () => {
    const coach = fakeDb({ ...message(OTHER), 'team_members.select': role('assistant_coach') });
    expect(await deleteMessage(coach.db, 'coach-1', { messageId: MESSAGE })).toMatchObject({ ok: true });

    const parent = fakeDb({ ...message(OTHER), 'team_members.select': role('parent') });
    expect(await deleteMessage(parent.db, 'parent-1', { messageId: MESSAGE })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(parent.calls.some((c) => c.op === 'update')).toBe(false);
  });
});

describe('deleteChannel', () => {
  it('should let a coach delete a topic channel but never a DM', async () => {
    const topic = fakeDb({ 'channels.select': { data: { team_id: TEAM, channel_type: 'topic' } }, 'team_members.select': role('head_coach') });
    expect(await deleteChannel(topic.db, 'coach-1', { channelId: CHANNEL })).toEqual({ ok: true, data: { channelId: CHANNEL } });
    expect(topic.calls.find((c) => c.op === 'delete')?.filters).toEqual({ id: CHANNEL });

    const dm = fakeDb({ 'channels.select': { data: { team_id: TEAM, channel_type: 'direct' } }, 'team_members.select': role('head_coach') });
    expect(await deleteChannel(dm.db, 'coach-1', { channelId: CHANNEL })).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('should refuse a player', async () => {
    const { db } = fakeDb({ 'channels.select': { data: { team_id: TEAM, channel_type: 'topic' } }, 'team_members.select': role('player') });
    expect(await deleteChannel(db, 'player-1', { channelId: CHANNEL })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

describe('createTeamChannel', () => {
  it('should add every active member, with only coaches posting in an announcement channel', async () => {
    const { db, calls } = fakeDb({
      'team_members.select': [
        role('head_coach'),
        { data: [{ user_id: 'coach-1', role: 'head_coach' }, { user_id: 'p1', role: 'player' }, { user_id: 'par1', role: 'parent' }] },
      ],
      'channels.insert': { data: { id: CHANNEL } },
    });
    const result = await createTeamChannel(db, 'coach-1', { teamId: TEAM, channelType: 'announcement', name: ' Field updates ', description: '' });

    expect(result).toEqual({ ok: true, data: { channelId: CHANNEL } });
    expect(calls.find((c) => c.table === 'channels' && c.op === 'insert')?.payload).toEqual({
      team_id: TEAM, channel_type: 'announcement', name: 'Field updates', description: null, created_by: 'coach-1',
    });
    expect(calls.find((c) => c.table === 'channel_members')?.payload).toEqual([
      { channel_id: CHANNEL, user_id: 'coach-1', can_post: true },
      { channel_id: CHANNEL, user_id: 'p1', can_post: false },
      { channel_id: CHANNEL, user_id: 'par1', can_post: false },
    ]);
  });

  it('should refuse a topic channel on a plan without them, and non-coaches', async () => {
    mockResolveTeamTier.mockResolvedValue(SubscriptionTier.FREE);
    const coach = fakeDb({ 'team_members.select': role('head_coach') });
    expect(await createTeamChannel(coach.db, 'coach-1', { teamId: TEAM, channelType: 'topic', name: 'Hitting' })).toMatchObject({
      ok: false, code: 'forbidden', error: "Topic channels aren't on this team's plan.",
    });
    const parent = fakeDb({ 'team_members.select': role('parent') });
    expect(await createTeamChannel(parent.db, 'parent-1', { teamId: TEAM, channelType: 'announcement', name: 'X' })).toMatchObject({
      ok: false, code: 'forbidden',
    });
  });

  it("should not leave a channel nobody can see when members can't be added", async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db, calls } = fakeDb({
      'team_members.select': [role('head_coach'), { data: [] }],
      'channels.insert': { data: { id: CHANNEL } },
      'channel_members.insert': { error: { message: 'boom' } },
    });
    expect(await createTeamChannel(db, 'coach-1', { teamId: TEAM, channelType: 'announcement', name: 'X' })).toMatchObject({
      ok: false, code: 'failed',
    });
    expect(calls.find((c) => c.table === 'channels' && c.op === 'delete')?.filters).toEqual({ id: CHANNEL });
  });
});

describe('direct messages', () => {
  it('should list the other active members by last name', async () => {
    const { db, calls } = fakeDb({
      'team_members.select': [role('parent'), { data: [{ user_id: 'u2', role: 'head_coach' }, { user_id: 'u3', role: 'player' }] }],
      'user_profiles.select': [
        { data: null },
        { data: [{ id: 'u2', first_name: 'Zed', last_name: 'Young' }, { id: 'u3', first_name: 'Ann', last_name: 'Coit' }] },
      ],
    });
    const result = await listDmCandidates(db, 'me', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);

    expect(dmCandidatesResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.people.map((p) => p.lastName)).toEqual(['Coit', 'Young']);
    expect(calls.filter((c) => c.table === 'team_members')[1].filters).toMatchObject({ 'user_id!=': 'me', is_active: true });
  });

  it('should reopen an existing DM instead of creating another', async () => {
    const { db, calls } = fakeDb({
      'team_members.select': [role('parent'), { data: { user_id: OTHER } }],
      'channel_members.select': [{ data: [{ channel_id: CHANNEL }] }, { data: { channel_id: CHANNEL } }],
    });
    expect(await startDirectMessage(db, 'me', { teamId: TEAM, targetUserId: OTHER })).toEqual({ ok: true, data: { channelId: CHANNEL } });
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('should create a DM with both people in it', async () => {
    const { db, calls } = fakeDb({
      'team_members.select': [role('parent'), { data: { user_id: OTHER } }],
      'channel_members.select': { data: [] },
      'channels.insert': { data: { id: CHANNEL } },
    });
    expect(await startDirectMessage(db, 'me', { teamId: TEAM, targetUserId: OTHER })).toEqual({ ok: true, data: { channelId: CHANNEL } });
    expect(calls.find((c) => c.table === 'channel_members' && c.op === 'insert')?.payload).toEqual([
      { channel_id: CHANNEL, user_id: 'me', can_post: true },
      { channel_id: CHANNEL, user_id: OTHER, can_post: true },
    ]);
  });

  it('should refuse DMs on a plan without them, to people off the team, and to yourself', async () => {
    mockResolveTeamTier.mockResolvedValue(SubscriptionTier.FREE);
    expect(await startDirectMessage(fakeDb({ 'team_members.select': role('parent') }).db, 'me', { teamId: TEAM, targetUserId: OTHER })).toMatchObject({
      ok: false, code: 'forbidden',
    });

    mockResolveTeamTier.mockResolvedValue(SubscriptionTier.PRO);
    const offTeam = fakeDb({ 'team_members.select': [role('parent'), { data: null }] });
    expect(await startDirectMessage(offTeam.db, 'me', { teamId: TEAM, targetUserId: OTHER })).toMatchObject({ ok: false, code: 'not_found' });

    const self = '55555555-5555-4555-8555-555555555555';
    expect(await startDirectMessage(fakeDb().db, self, { teamId: TEAM, targetUserId: self })).toMatchObject({ ok: false, code: 'invalid' });
  });
});
