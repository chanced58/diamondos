import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { useSyncContext } from '../../../../../../../src/providers/SyncProvider';
import {
  leagueAdminQueryKey,
  releaseLeaguePlayer,
  useLeaguePlayer,
} from '../../../../../../../src/features/league-admin/league-admin-api';
import { describeApiError } from '../../../../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/**
 * Releases a player into the league's free-agent pool (the web Release
 * dialog), with an optional reason. Their season stats stay with the team.
 * League admins only; the server refuses a player in a live game.
 */
export default function ReleaseLeaguePlayerScreen() {
  const { leagueId = '', playerId = '' } = useLocalSearchParams<{ leagueId: string; playerId: string }>();
  const query = useLeaguePlayer(leagueId, playerId);
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();
  const [reason, setReason] = useState('');

  const release = useMutation({
    mutationFn: () => releaseLeaguePlayer(leagueId, playerId, { reason: reason.trim() || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leagueAdminQueryKey(leagueId) });
      void triggerSync();
      router.back();
    },
  });

  const player = query.data?.player;
  const header = <Stack.Screen options={{ title: 'Release player' }} />;
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data || !player) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }
  if (!query.data.canEdit || player.teamId === null) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState
          title={query.data.canEdit ? 'Already a free agent' : 'League admins only'}
          message={query.data.canEdit ? 'This player isn’t on a team.' : 'Only league admins release players.'}
        />
      </View>
    );
  }

  const fullName = `${player.firstName} ${player.lastName}`;
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <Text className="text-xl font-bold text-gray-900">Release {fullName}</Text>
        <Text className="text-sm text-gray-600 mt-2 mb-4">
          {fullName} moves off {player.teamName ?? 'their team'} into the free-agent pool. Their season stats stay with that team.
        </Text>
        <FormField label="Reason">
          <TextInput
            accessibilityLabel="Reason"
            className={`${inputClass} min-h-[72px]`}
            multiline
            textAlignVertical="top"
            placeholder="Optional"
            placeholderTextColor="#9ca3af"
            value={reason}
            onChangeText={setReason}
            maxLength={500}
          />
        </FormField>
        {release.isError && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
            {describeApiError(release.error)}
          </Text>
        )}
        <Button
          label={release.isPending ? 'Releasing…' : 'Confirm release'}
          variant="danger"
          loading={release.isPending}
          onPress={() => release.mutate()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
