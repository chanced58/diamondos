import { useState } from 'react';
import { ActivityIndicator, View, Text, FlatList, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { Feature } from '@baseball/shared';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { database } from '../../../src/db';
import type { Channel } from '../../../src/db/models/Channel';
import type { Message } from '../../../src/db/models/Message';
import { useAuth } from '../../../src/providers/AuthProvider';
import { useCan, useRole } from '../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../src/features/teams/TeamSwitcher';
import { OptionSheet } from '../../../src/features/opponents/OptionSheet';
import { resolveChannelLabel, visibleChannels } from '../../../src/features/messaging/channel-label';

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

// Scoped to the active team: the local mirror holds the channels of every
// team the user belongs to, and the list used to show them all mixed together.
const ChannelListEnhanced = withObservables(['teamId'], ({ teamId }: { teamId: string }) => ({
  channels: database
    .get<Channel>('channels')
    .query(Q.where('team_id', teamId), Q.sortBy('channel_type', Q.asc))
    .observe(),
  // Denormalised sender_name on messages is what lets a direct channel's
  // counterparty be resolved offline — see channel-label.ts. A handful of
  // channels means a full messages observable here stays cheap.
  messages: database.get<Message>('messages').query().observe(),
}))((props: { teamId: string; channels: Channel[]; messages: Message[] }) => {
  const { user } = useAuth();
  const canTopics = useCan(Feature.TOPIC_CHANNELS);
  const canDms = useCan(Feature.DIRECT_MESSAGES);
  const channelsWithMessages: ChannelWithMessages[] = visibleChannels(props.channels, { canTopics, canDms }).map((channel) => ({
    channel,
    messages: props.messages.filter((m) => m.channelRemoteId === channel.remoteId),
  }));

  return (
    <ChannelList channelsWithMessages={channelsWithMessages} currentUserId={user?.id ?? null} />
  );
});

export default function MessagesScreen() {
  const { activeTeam, loading } = useRole();
  const isCoach = useCan('team.coach');
  const canDms = useCan(Feature.DIRECT_MESSAGES);
  const [choosing, setChoosing] = useState(false);

  const actions = [
    ...(isCoach ? [{ key: 'channel', label: 'New channel', onPress: () => router.push('/(tabs)/messages/new') }] : []),
    ...(canDms ? [{ key: 'dm', label: 'New direct message', onPress: () => router.push('/(tabs)/messages/new-dm') }] : []),
  ];

  const header = (
    <Stack.Screen
      options={{
        headerRight:
          activeTeam && actions.length > 0
            ? () => (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="New conversation"
                  hitSlop={8}
                  onPress={() => (actions.length === 1 ? actions[0].onPress() : setChoosing(true))}
                >
                  <Text className="text-white text-2xl font-semibold">+</Text>
                </TouchableOpacity>
              )
            : undefined,
      }}
    />
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <OptionSheet
        title={choosing ? 'Start a conversation' : null}
        options={actions.map((action) => ({
          ...action,
          onPress: () => {
            setChoosing(false);
            action.onPress();
          },
        }))}
        onClose={() => setChoosing(false)}
      />
      <TeamSwitcher />
      {activeTeam ? (
        <ChannelListEnhanced teamId={activeTeam.teamId} />
      ) : (
        <ChannelList channelsWithMessages={[]} currentUserId={null} />
      )}
    </View>
  );
}
