import { resolveChannelLabel, type ResolveChannelLabelInput } from '../channel-label';

/**
 * W10 (M7): direct channels store `channels.name = null`, so the channel
 * list rendered the literal string "Direct Message" for every DM with no
 * way to tell them apart. These cover the resolution rules
 * `resolveChannelLabel` now encodes — deriving the counterparty's name from
 * the denormalised `messages.sender_name` when the channel has no name of
 * its own.
 */

const CURRENT_USER_ID = 'user-me';

function mkInput(overrides: Partial<ResolveChannelLabelInput> = {}): ResolveChannelLabelInput {
  return {
    channel: { name: null, channelType: 'direct' },
    messages: [],
    currentUserId: CURRENT_USER_ID,
    ...overrides,
  };
}

describe('resolveChannelLabel', () => {
  it('returns the channel name when present, regardless of type or messages', () => {
    const label = resolveChannelLabel(
      mkInput({
        channel: { name: 'Varsity Announcements', channelType: 'announcement' },
        messages: [
          { senderId: 'other', senderName: 'Coach Smith', createdAt: 1 },
        ],
      }),
    );

    expect(label).toBe('Varsity Announcements');
  });

  it('resolves a direct channel to the other party\'s name from a message they sent', () => {
    const label = resolveChannelLabel(
      mkInput({
        messages: [
          { senderId: 'other-user', senderName: 'Jamie Rivera', createdAt: 100 },
        ],
      }),
    );

    expect(label).toBe('Jamie Rivera');
  });

  it('falls back to "Direct Message" when only the current user has written', () => {
    const label = resolveChannelLabel(
      mkInput({
        messages: [
          { senderId: CURRENT_USER_ID, senderName: 'Me', createdAt: 100 },
        ],
      }),
    );

    expect(label).toBe('Direct Message');
  });

  it('falls back to "Direct Message" when there are no messages at all', () => {
    const label = resolveChannelLabel(mkInput({ messages: [] }));

    expect(label).toBe('Direct Message');
  });

  it('picks the most recent counterparty message when there are several', () => {
    const label = resolveChannelLabel(
      mkInput({
        messages: [
          { senderId: 'other-user', senderName: 'Old Name', createdAt: 100 },
          { senderId: 'other-user', senderName: 'Newest Name', createdAt: 300 },
          { senderId: 'other-user', senderName: 'Middle Name', createdAt: 200 },
        ],
      }),
    );

    expect(label).toBe('Newest Name');
  });

  it('labels an unnamed non-direct channel "Channel", not "Direct Message"', () => {
    const label = resolveChannelLabel(
      mkInput({
        channel: { name: null, channelType: 'topic' },
        messages: [
          { senderId: 'other-user', senderName: 'Jamie Rivera', createdAt: 100 },
        ],
      }),
    );

    expect(label).toBe('Channel');
  });

  it('treats an empty-string channel name as absent and falls through to resolution', () => {
    const label = resolveChannelLabel(
      mkInput({
        channel: { name: '   ', channelType: 'direct' },
        messages: [
          { senderId: 'other-user', senderName: 'Jamie Rivera', createdAt: 100 },
        ],
      }),
    );

    expect(label).toBe('Jamie Rivera');
  });

  it('F2: falls back to "Direct Message" rather than the current user\'s own name when currentUserId is null', () => {
    // Real bug: `m.senderId !== currentUserId` is true for every message
    // when `currentUserId` is null (falsy), so a DM containing only the
    // current user's own messages would render the current user's own name
    // as the counterparty.
    const label = resolveChannelLabel(
      mkInput({
        currentUserId: null,
        messages: [
          { senderId: 'whoever-i-actually-am', senderName: 'Me', createdAt: 100 },
        ],
      }),
    );

    expect(label).toBe('Direct Message');
    expect(label).not.toBe('Me');
  });

  it('skips a counterparty message with a null senderName rather than returning an empty label', () => {
    const label = resolveChannelLabel(
      mkInput({
        messages: [
          { senderId: 'other-user', senderName: null, createdAt: 300 },
          { senderId: 'other-user', senderName: 'Jamie Rivera', createdAt: 100 },
        ],
      }),
    );

    expect(label).toBe('Jamie Rivera');
  });
});
