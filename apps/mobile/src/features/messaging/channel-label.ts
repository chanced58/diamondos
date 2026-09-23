/**
 * W10 (M7): direct channels store `channels.name = null`, so
 * `messages/index.tsx` rendered the literal string "Direct Message" for
 * every DM with no participant name — indistinguishable from every other DM.
 *
 * There is no local membership data to look the counterparty up from (the
 * pull query filters `channel_members` to the current user and `mapChannel`
 * keeps only `can_post` from it), and neither a schema change (bumping
 * `db/schema.ts` without a correct migration wipes every device's unsynced
 * offline events) nor an online lookup at render time (the anti-pattern W2
 * removed from Schedule and Practices) is on the table here.
 *
 * The route that works offline: `messages.sender_name` is denormalised into
 * WatermelonDB precisely for this ("Denormalized for offline display" in the
 * schema, populated by `mapMessage` from the `user_profiles!sender_id`
 * join). For a direct channel, the counterparty is the sender of the most
 * recent message in that channel who isn't the current user.
 *
 * Known limitation: a DM with no messages yet, or one where only the current
 * user has written, has nobody to derive a name from and still reads
 * "Direct Message". That's an accepted gap of the offline-only route, not an
 * oversight — see w10-report.md.
 */

export interface ChannelLabelChannel {
  name: string | null;
  channelType: string;
}

export interface ChannelLabelMessage {
  senderId: string;
  senderName: string | null;
  createdAt: number;
}

export interface ResolveChannelLabelInput {
  channel: ChannelLabelChannel;
  messages: ChannelLabelMessage[];
  currentUserId: string | null;
}

const DIRECT_MESSAGE_FALLBACK = 'Direct Message';
const CHANNEL_FALLBACK = 'Channel';

/** Empty and whitespace-only strings are treated as absent throughout. */
function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Pure resolver for the label shown in the channel list row. No React, no
 * I/O, no WatermelonDB import — directly unit-testable.
 */
export function resolveChannelLabel(input: ResolveChannelLabelInput): string {
  const { channel, messages, currentUserId } = input;

  const explicitName = nonEmpty(channel.name);
  if (explicitName) return explicitName;

  if (channel.channelType !== 'direct') {
    return CHANNEL_FALLBACK;
  }

  // Without a known current user, `m.senderId !== currentUserId` is true for
  // every message — including the current user's own — so a DM containing
  // only the current user's own messages would render their own name as the
  // counterparty. Bail out to the fallback before the filter runs.
  if (!currentUserId) {
    return DIRECT_MESSAGE_FALLBACK;
  }

  const counterpartyMessages = messages
    .filter((m) => m.senderId !== currentUserId && nonEmpty(m.senderName))
    .sort((a, b) => b.createdAt - a.createdAt);

  const mostRecent = counterpartyMessages[0];
  if (mostRecent) {
    // Non-null by construction of the filter above.
    return nonEmpty(mostRecent.senderName)!;
  }

  return DIRECT_MESSAGE_FALLBACK;
}
