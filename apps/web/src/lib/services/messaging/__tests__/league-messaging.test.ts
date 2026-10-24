import { leagueChannelDetailResponseSchema, leagueChannelsResponseSchema } from '@baseball/shared';
import { listLeagueChannels, loadLeagueChannel } from '../league-messaging';
import { fakeDb } from '../../__tests__/fake-db';

const TEAM = '11111111-1111-4111-8111-111111111111';
const CHANNEL = '22222222-2222-4222-8222-222222222222';
const LEAGUE = '33333333-3333-4333-8333-333333333333';

const member = { data: { role: 'head_coach' } };
const channelRow = (id: string, channel_type: string, name: string | null) => ({
  league_channel_id: id,
  can_post: channel_type === 'announcement',
  league_channels: { id, league_id: LEAGUE, channel_type, name, description: null },
});

describe('listLeagueChannels', () => {
  it("should list the caller's channels in the team's league, announcements first", async () => {
    const { db, calls } = fakeDb({
      'team_members.select': member,
      'league_members.select': { data: { leagues: { id: LEAGUE, name: 'Idaho 2A' } } },
      'league_channel_members.select': {
        data: [channelRow('c-topic', 'topic', 'Umpires'), channelRow('c-ann', 'announcement', null)],
      },
    });
    const result = await listLeagueChannels(db, 'me', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);

    expect(leagueChannelsResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data).toEqual({
      teamId: TEAM,
      leagueName: 'Idaho 2A',
      channels: [
        { id: 'c-ann', name: 'League Channel', channelType: 'announcement', description: null, canPost: true },
        { id: 'c-topic', name: 'Umpires', channelType: 'topic', description: null, canPost: false },
      ],
    });
    // Memberships, not every channel the league has.
    expect(calls.find((c) => c.table === 'league_channel_members')?.filters).toMatchObject({
      user_id: 'me',
      'league_channels.league_id': LEAGUE,
    });
  });

  it('should answer none for a team in no league', async () => {
    const { db, calls } = fakeDb({ 'team_members.select': member, 'league_members.select': { data: null } });
    expect(await listLeagueChannels(db, 'me', { teamId: TEAM })).toEqual({
      ok: true,
      data: { teamId: TEAM, leagueName: null, channels: [] },
    });
    expect(calls.some((c) => c.table === 'league_channel_members')).toBe(false);
  });

  it('should refuse someone off the team', async () => {
    const { db, calls } = fakeDb({ 'team_members.select': { data: null } });
    expect(await listLeagueChannels(db, 'stranger', { teamId: TEAM })).toMatchObject({ ok: false, code: 'not_found' });
    expect(calls.some((c) => c.table === 'league_members')).toBe(false);
  });
});

describe('loadLeagueChannel', () => {
  it('should give a member the latest messages oldest first, with names, and mark it read', async () => {
    const { db, calls } = fakeDb({
      'league_channel_members.select': { data: { can_post: false } },
      'league_channels.select': {
        data: { id: CHANNEL, league_id: LEAGUE, channel_type: 'announcement', name: 'League Announcements', description: 'Official' },
      },
      'league_messages.select': {
        data: [
          { id: 'm2', body: 'Second', sender_id: 'u2', created_at: '2026-10-24T02:00:00Z', edited_at: null, user_profiles: null },
          {
            id: 'm1', body: 'First', sender_id: 'u1', created_at: '2026-10-24T01:00:00Z', edited_at: '2026-10-24T01:05:00Z',
            user_profiles: { first_name: 'Ann', last_name: 'Coit' },
          },
        ],
      },
    });
    const result = await loadLeagueChannel(db, 'me', { leagueChannelId: CHANNEL });
    if (!result.ok) throw new Error(result.error);

    expect(leagueChannelDetailResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.canPost).toBe(false);
    expect(result.data.channel).toEqual({
      id: CHANNEL, leagueId: LEAGUE, name: 'League Announcements', channelType: 'announcement', description: 'Official',
    });
    expect(result.data.messages).toEqual([
      { id: 'm1', body: 'First', senderId: 'u1', senderName: 'Ann Coit', createdAt: '2026-10-24T01:00:00Z', editedAt: '2026-10-24T01:05:00Z' },
      { id: 'm2', body: 'Second', senderId: 'u2', senderName: 'Unknown', createdAt: '2026-10-24T02:00:00Z', editedAt: null },
    ]);
    expect(calls.find((c) => c.table === 'league_messages')?.filters).toMatchObject({ league_channel_id: CHANNEL, 'deleted_at is': null });
    const read = calls.find((c) => c.table === 'league_channel_members' && c.op === 'update')!;
    expect(read.filters).toEqual({ league_channel_id: CHANNEL, user_id: 'me' });
    expect(read.payload).toHaveProperty('last_read_at');
  });

  it('should hide a channel from someone who is not in it', async () => {
    const { db, calls } = fakeDb({ 'league_channel_members.select': { data: null } });
    expect(await loadLeagueChannel(db, 'stranger', { leagueChannelId: CHANNEL })).toMatchObject({ ok: false, code: 'not_found' });
    expect(calls.some((c) => c.table === 'league_messages')).toBe(false);
  });

  it('should reject a malformed channel id', async () => {
    expect(await loadLeagueChannel(fakeDb().db, 'me', { leagueChannelId: 'nope' })).toMatchObject({ ok: false, code: 'invalid' });
  });
});
