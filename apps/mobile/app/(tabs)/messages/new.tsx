import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, EmptyState, FormField, SegmentedControl } from '@baseball/ui';
import { Feature } from '@baseball/shared';
import { useCan, useRole } from '../../../src/providers/RoleProvider';
import { useSyncContext } from '../../../src/providers/SyncProvider';
import { createChannel, type NewChannelFields } from '../../../src/features/messaging/messaging-api';
import { describeApiError } from '../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/**
 * A coach adds a channel to the active team (the web New Channel form):
 * announcements are coach-posted; topic channels, open to everyone, need a
 * plan with topic channels. Every active member joins.
 */
export default function NewChannelScreen() {
  const { activeTeam } = useRole();
  const isCoach = useCan('team.coach');
  const canTopics = useCan(Feature.TOPIC_CHANNELS);
  const { triggerSync } = useSyncContext();
  const [channelType, setChannelType] = useState<NewChannelFields['channelType']>(canTopics ? 'topic' : 'announcement');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (fields: NewChannelFields) => createChannel(activeTeam?.teamId ?? '', fields),
    // Pull it onto the device, then open it.
    onSuccess: async ({ channelId }) => {
      await triggerSync();
      router.replace({ pathname: '/(tabs)/messages/[channelId]', params: { channelId } });
    },
  });

  if (!activeTeam || !isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        <Stack.Screen options={{ title: 'New channel' }} />
        <EmptyState title="Coaches only" message="Only coaches can create channels." />
      </View>
    );
  }

  const typeOptions = [
    ...(canTopics ? [{ value: 'topic' as const, label: 'Topic' }] : []),
    { value: 'announcement' as const, label: 'Announcement' },
  ];

  const submit = () => {
    if (!name.trim()) {
      setProblem('Channel name is required.');
      return;
    }
    setProblem(null);
    create.mutate({ channelType, name: name.trim(), description: description.trim() || null });
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'New channel' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {typeOptions.length > 1 && (
          <View className="mb-4">
            <SegmentedControl options={typeOptions} value={channelType} onChange={setChannelType} testID="channel-type" />
          </View>
        )}
        <Text className="text-sm text-gray-500 mb-4">
          {channelType === 'announcement'
            ? 'Coaches post; the whole team reads.'
            : 'Open discussion — everyone on the team can post.'}
        </Text>
        <FormField label="Name" required>
          <TextInput
            accessibilityLabel="Channel name"
            className={inputClass}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Pitchers"
            placeholderTextColor="#9ca3af"
            maxLength={80}
          />
        </FormField>
        <FormField label="Description">
          <TextInput
            accessibilityLabel="Description"
            className={inputClass}
            value={description}
            onChangeText={setDescription}
            placeholder="What's it for?"
            placeholderTextColor="#9ca3af"
            maxLength={300}
          />
        </FormField>
        {(problem ?? create.error) && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
            {problem ?? describeApiError(create.error)}
          </Text>
        )}
        <Button label="Create channel" size="lg" loading={create.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
