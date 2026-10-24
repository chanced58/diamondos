import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import type { Channel } from '../../db/models/Channel';
import type { Message } from '../../db/models/Message';

/**
 * Takes a channel the server just deleted (and its messages) off this device
 * at once. The pull would only drop it at the next deletion reconciliation —
 * up to 15 minutes later — and it would sit in the list meanwhile.
 * Destroyed outright, not marked deleted: the push never sends channel or
 * message deletions, and the server has already removed them.
 */
export async function removeChannelLocally(channelRemoteId: string): Promise<void> {
  await database.write(async () => {
    const [channels, messages] = await Promise.all([
      database.get<Channel>('channels').query(Q.where('remote_id', channelRemoteId)).fetch(),
      database.get<Message>('messages').query(Q.where('channel_remote_id', channelRemoteId)).fetch(),
    ]);
    await database.batch(...[...messages, ...channels].map((record) => record.prepareDestroyPermanently()));
  });
}
