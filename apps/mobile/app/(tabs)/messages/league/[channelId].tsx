import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '@baseball/ui';
import { formatDate, formatTime, type LeagueMessage } from '@baseball/shared';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { describeApiError } from '../../../../src/lib/api-client';
import {
  leagueChannelQueryKey,
  postLeagueMessage,
  useLeagueChannel,
  useLeagueChannelRealtime,
} from '../../../../src/features/messaging/league-messaging-api';

/**
 * A league channel (the web League Channel page): online-only, refetched
 * live as messages land. Announcements read as cards; only members who can
 * post (league staff, as set up today) get the composer.
 */
export default function LeagueChannelScreen() {
  const { channelId = '' } = useLocalSearchParams<{ channelId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useLeagueChannel(channelId);
  useLeagueChannelRealtime(channelId);
  const [draft, setDraft] = useState('');

  const send = useMutation({
    mutationFn: (body: string) => postLeagueMessage(channelId, user?.id ?? '', body),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: leagueChannelQueryKey(channelId) });
    },
  });

  const header = <Stack.Screen options={{ title: query.data?.channel.name ?? 'League channel' }} />;

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const { channel, canPost, messages } = query.data;
  const isAnnouncement = channel.channelType === 'announcement';
  const body = draft.trim();
  const submit = () => {
    if (!body || !user || send.isPending) return;
    send.mutate(body);
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {header}
      <View className="bg-white border-b border-gray-200 px-4 py-2 flex-row items-center">
        <Text className="flex-1 text-xs text-gray-500">{channel.description ?? ''}</Text>
        <Text className="text-[10px] font-medium text-amber-700 bg-amber-50 rounded-full overflow-hidden px-2 py-0.5 ml-2">League</Text>
      </View>

      <FlatList
        data={[...messages].reverse()}
        keyExtractor={(m) => m.id}
        inverted
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={{ transform: [{ scaleY: -1 }] }}>
            <Text className="py-10 text-center text-gray-500">No messages yet.</Text>
          </View>
        }
        renderItem={({ item }) =>
          isAnnouncement ? (
            <AnnouncementCard message={item} isOwn={item.senderId === user?.id} />
          ) : (
            <LeagueBubble message={item} isOwn={item.senderId === user?.id} />
          )
        }
      />

      {canPost ? (
        <View className="bg-white border-t border-gray-200 px-4 py-3">
          {send.error && (
            <Text accessibilityRole="alert" className="text-xs text-red-700 mb-2">
              {describeApiError(send.error)}
            </Text>
          )}
          <View className="flex-row items-end gap-3">
            <TextInput
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-gray-900 max-h-24"
              placeholder="Write a message..."
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <TouchableOpacity
              className={`bg-amber-700 w-10 h-10 rounded-full items-center justify-center ${!body || send.isPending ? 'opacity-40' : ''}`}
              onPress={submit}
              disabled={!body || send.isPending}
              accessibilityLabel="Send message"
            >
              <Text className="text-white font-bold">→</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className="bg-gray-100 border-t border-gray-200 px-4 py-3">
          <Text className="text-gray-400 text-sm text-center">Read-only. Only league staff can post here.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

interface MessageProps {
  message: LeagueMessage;
  isOwn: boolean;
}

function AnnouncementCard({ message, isOwn }: MessageProps) {
  return (
    <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-bold text-amber-900">{isOwn ? 'You' : message.senderName}</Text>
        <Text className="text-xs text-amber-600">
          {formatDate(message.createdAt)} · {formatTime(message.createdAt)}
        </Text>
      </View>
      <Text className="text-gray-900 leading-relaxed">{message.body}</Text>
      {message.editedAt && <Text className="text-xs text-gray-400 italic mt-1">(edited)</Text>}
    </View>
  );
}

function LeagueBubble({ message, isOwn }: MessageProps) {
  return (
    <View className={`mb-3 max-w-xs ${isOwn ? 'self-end' : 'self-start'}`}>
      {!isOwn && <Text className="text-xs text-gray-500 mb-0.5 ml-1">{message.senderName}</Text>}
      <View
        className={`rounded-2xl px-4 py-2.5 ${isOwn ? 'bg-amber-700 rounded-br-sm' : 'bg-white border border-gray-200 rounded-bl-sm'}`}
      >
        <Text className={isOwn ? 'text-white' : 'text-gray-900'}>{message.body}</Text>
      </View>
      <Text className="text-xs text-gray-400 mt-0.5 mx-1">
        {formatTime(message.createdAt)}
        {message.editedAt ? ' · edited' : ''}
      </Text>
    </View>
  );
}
