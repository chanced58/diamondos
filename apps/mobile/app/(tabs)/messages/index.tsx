import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { database } from '../../../src/db';
import type { Channel } from '../../../src/db/models/Channel';
import type { Message } from '../../../src/db/models/Message';
import { useAuth } from '../../../src/providers/AuthProvider';
import { resolveChannelLabel } from '../../../src/features/messaging/channel-label';

interface ChannelWithMessages {
  channel: Channel;
  messages: Message[];
}

interface ChannelListProps {
  channelsWithMessages: ChannelWithMessages[];
  currentUserId: string | null;
}

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  announcement: '📢',
  topic: '💬',
  direct: '👤',
};

function ChannelList({ channelsWithMessages, currentUserId }: ChannelListProps) {
  if (channelsWithMessages.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-400 text-base">No channels yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={channelsWithMessages}
      keyExtractor={({ channel }) => channel.id}
      contentContainerStyle={{ padding: 16 }}
      renderItem={({ item: { channel, messages } }) => {
        const label = resolveChannelLabel({
          channel: { name: channel.name ?? null, channelType: channel.channelType },
          messages: messages.map((m) => ({
            senderId: m.senderId,
            senderName: m.senderName ?? null,
            createdAt: m.createdAt,
          })),
          currentUserId,
        });

        return (
          <TouchableOpacity
            className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 mb-2 flex-row items-center"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/messages/[channelId]',
                params: { channelId: channel.remoteId },
              })
            }
          >
            <Text className="text-2xl mr-3">
              {CHANNEL_TYPE_LABELS[channel.channelType] ?? '💬'}
            </Text>
            <View className="flex-1">
              <Text className="font-semibold text-gray-900">{label}</Text>
              {channel.description && (
                <Text className="text-gray-500 text-sm" numberOfLines={1}>
                  {channel.description}
                </Text>
              )}
            </View>
            {!channel.canPost && (
              <Text className="text-xs text-gray-400 ml-2">Read-only</Text>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const ChannelListEnhanced = withObservables([], () => ({
  channels: database
    .get<Channel>('channels')
    .query(Q.sortBy('channel_type', Q.asc))
    .observe(),
  // Denormalised sender_name on messages is what lets a direct channel's
  // counterparty be resolved offline — see channel-label.ts. A handful of
  // channels means a full messages observable here stays cheap.
  messages: database.get<Message>('messages').query().observe(),
}))((props: { channels: Channel[]; messages: Message[] }) => {
  const { user } = useAuth();
  const channelsWithMessages: ChannelWithMessages[] = props.channels.map((channel) => ({
    channel,
    messages: props.messages.filter((m) => m.channelRemoteId === channel.remoteId),
  }));

  return (
    <ChannelList channelsWithMessages={channelsWithMessages} currentUserId={user?.id ?? null} />
  );
});

export default function MessagesScreen() {
  return (
    <View className="flex-1 bg-gray-50">
      <ChannelListEnhanced />
    </View>
  );
}
