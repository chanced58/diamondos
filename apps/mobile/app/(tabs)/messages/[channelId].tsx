import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useState, useRef } from 'react';
import { randomUUID } from 'expo-crypto';
import { map } from 'rxjs';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useMutation } from '@tanstack/react-query';
import type { ChannelDetailResponse } from '@baseball/shared';
import { database } from '../../../src/db';
import type { Message } from '../../../src/db/models/Message';
import type { Channel } from '../../../src/db/models/Channel';
import { useAuth } from '../../../src/providers/AuthProvider';
import { getSupabaseClient } from '../../../src/lib/supabase';
import { describeApiError } from '../../../src/lib/api-client';
import { deleteChannel, deleteMessage, useChannelDetail } from '../../../src/features/messaging/messaging-api';
import { useChannelRealtime } from '../../../src/features/messaging/use-channel-realtime';
import { removeChannelLocally } from '../../../src/features/messaging/local-channel';
import { roleBadge } from '../../../src/features/messaging/role-badges';
import { formatTime } from '@baseball/shared';

interface MessageThreadProps {
  channelRemoteId: string;
  messages: Message[];
  channel: Channel | undefined;
}

function MessageThread({ channelRemoteId, messages, channel }: MessageThreadProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const detail = useChannelDetail(channelRemoteId);
  const { requestSync } = useChannelRealtime(channelRemoteId);

  // The device's copy decides posting offline; a channel just created or
  // opened before its first sync falls back to the server's answer.
  const canPost = channel?.canPost ?? detail.data?.canPost ?? false;
  const title = detail.data?.channel.displayName ?? channel?.name ?? 'Channel';

  const removeMessage = useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onSuccess: requestSync,
    onError: (error) => Alert.alert('Could not delete the message', describeApiError(error)),
  });
  const removeChannel = useMutation({
    mutationFn: () => deleteChannel(channelRemoteId),
    onSuccess: async () => {
      await removeChannelLocally(channelRemoteId).catch((err) =>
        console.warn(`Could not remove channel ${channelRemoteId} locally; the next deletion check will`, err),
      );
      router.back();
    },
    onError: (error) => Alert.alert('Could not delete the channel', describeApiError(error)),
  });

  async function handleSend() {
    const body = text.trim();
    if (!body || !user || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('messages').insert({
        channel_id: channelRemoteId,
        sender_id: user.id,
        body,
      });
      if (error) throw error;
      setText('');
      requestSync();
    } catch (err) {
      console.warn('Message send failed; queueing offline message', err);
      await database.write(async () => {
        // Assign the decorated (camelCase) properties — raw column names set
        // on a Model are silently discarded and the queued row would be
        // written blank. See the note in use-record-event.ts.
        await database.get<Message>('messages').create((record: Message) => {
          const messageId = randomUUID();
          record._raw.id = messageId;
          record.remoteId = messageId;
          record.channelId = '';
          record.channelRemoteId = channelRemoteId;
          record.senderId = user.id;
          // Display-only until the pull replaces this row with the server
          // version, which carries the real name from user_profiles. Writing
          // the email here would keep an identifier in the local database for
          // every message queued offline, and show it where every other
          // message shows a name.
          record.senderName = 'You';
          record.body = body;
          record.parentId = undefined;
          record.isPinned = false;
          record.createdAt = Date.now();
          record.syncedAt = undefined;
        });
      });
      setText('');
      Alert.alert('Queued for sync', 'Your message will send when you reconnect.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const confirmDeleteMessage = (message: Message) =>
    Alert.alert('Delete this message?', message.body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeMessage.mutate(message.remoteId) },
    ]);
  const confirmDeleteChannel = () =>
    Alert.alert(`Delete ${title}?`, 'Its messages are deleted for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeChannel.mutate() },
    ]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen
        options={{
          title,
          headerShown: true,
          headerRight: detail.data?.canDeleteChannel
            ? () => (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete channel" hitSlop={8} onPress={confirmDeleteChannel}>
                  <Text className="text-white text-base font-semibold">Delete</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        inverted
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={{ transform: [{ scaleY: -1 }] }}>
            <Text className="py-10 text-center text-gray-500">No messages yet.</Text>
          </View>
        }
        renderItem={({ item: message }) => (
          <MessageBubble
            message={message}
            isOwn={message.senderId === user?.id}
            detail={detail.data}
            onDelete={confirmDeleteMessage}
          />
        )}
      />

      {canPost ? (
        <View className="bg-white border-t border-gray-200 px-4 py-3 flex-row items-end gap-3">
          <TextInput
            className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-gray-900 max-h-24"
            placeholder="Type a message..."
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            className={`bg-brand-700 w-10 h-10 rounded-full items-center justify-center ${
              !text.trim() || sending ? 'opacity-40' : ''
            }`}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            accessibilityLabel="Send message"
          >
            <Text className="text-white font-bold">→</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="bg-gray-100 border-t border-gray-200 px-4 py-3">
          <Text className="text-gray-400 text-sm text-center">Read-only channel</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  detail: ChannelDetailResponse | undefined;
  onDelete: (message: Message) => void;
}

/**
 * One message. Long press deletes your own, or any for a coach — once it has
 * reached the server (a message still queued offline has nothing to delete).
 */
function MessageBubble({ message, isOwn, detail, onDelete }: MessageBubbleProps) {
  const canDelete = message.syncedAt != null && (isOwn || detail?.isCoach === true);
  const badge = roleBadge(detail?.memberRoles[message.senderId]);
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={!canDelete}
      accessibilityHint={canDelete ? 'Long press to delete' : undefined}
      onLongPress={() => onDelete(message)}
      className={`mb-3 max-w-xs ${isOwn ? 'self-end' : 'self-start'}`}
    >
      {!isOwn && (
        <View className="flex-row items-center mb-0.5 ml-1">
          <Text className="text-xs text-gray-500">{message.senderName ?? 'Unknown'}</Text>
          {badge && (
            <Text className={`text-[10px] font-medium rounded-full overflow-hidden px-1.5 ml-1.5 ${badge.className}`}>{badge.label}</Text>
          )}
        </View>
      )}
      <View
        className={`rounded-2xl px-4 py-2.5 ${
          isOwn ? 'bg-brand-700 rounded-br-sm' : 'bg-white border border-gray-200 rounded-bl-sm'
        }`}
      >
        <Text className={isOwn ? 'text-white' : 'text-gray-900'}>{message.body}</Text>
      </View>
      <Text className="text-xs text-gray-400 mt-0.5 mx-1">
        {formatTime(new Date(message.createdAt))}
      </Text>
    </TouchableOpacity>
  );
}

const EnhancedMessageThread = withObservables(
  ['channelRemoteId'],
  ({ channelRemoteId }: { channelRemoteId: string }) => ({
    messages: database
      .get<Message>('messages')
      .query(
        Q.where('channel_remote_id', channelRemoteId),
        Q.sortBy('created_at', Q.desc),
        Q.take(100),
      )
      .observe(),
    channel: database
      .get<Channel>('channels')
      .query(Q.where('remote_id', channelRemoteId))
      .observe()
      .pipe(map((channels: Channel[]) => channels[0])),
  }),
)((props: { channelRemoteId: string; messages: Message[]; channel: Channel | undefined }) => (
  <MessageThread channelRemoteId={props.channelRemoteId} messages={props.messages} channel={props.channel} />
));

export default function ChannelScreen() {
  const { channelId = '' } = useLocalSearchParams<{ channelId: string }>();
  return <EnhancedMessageThread channelRemoteId={channelId} />;
}
