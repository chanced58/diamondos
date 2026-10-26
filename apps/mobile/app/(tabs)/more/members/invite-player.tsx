import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { useRole } from '../../../../src/providers/RoleProvider';
import { invitePlayer, teamMembersQueryKey, useTeamMembers } from '../../../../src/features/members/members-api';
import { inviteOutcomeMessage } from '../../../../src/features/members/invite-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/**
 * Invite a rostered player to the app (the web team admin Users page's
 * invite and connect): at the email on their roster entry, or another one.
 * An existing account is connected at once.
 */
export default function InvitePlayerScreen() {
  const { playerId = '' } = useLocalSearchParams<{ playerId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const members = useTeamMembers(teamId);
  const queryClient = useQueryClient();
  const player = members.data?.players.find((p) => p.playerId === playerId);
  const [email, setEmail] = useState<string | null>(null);
  const shownEmail = email ?? player?.email ?? '';

  const invite = useMutation({
    mutationFn: (address: string) => invitePlayer(teamId as string, playerId, address),
    onSuccess: (result, address) => {
      void queryClient.invalidateQueries({ queryKey: teamMembersQueryKey(teamId ?? '') });
      Alert.alert(result.outcome === 'invited' ? 'Invite sent' : 'Connected', inviteOutcomeMessage(result, address));
      router.back();
    },
  });

  const header = <Stack.Screen options={{ title: 'Invite to the app' }} />;
  if (members.isPending && teamId) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!members.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(members.error)} onRetry={() => void members.refetch()} />
      </View>
    );
  }
  if (!player) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Player not found" message="This player isn’t on the active roster." />
      </View>
    );
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shownEmail.trim());
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <Text className="text-xl font-bold text-gray-900">
          {player.firstName} {player.lastName}
        </Text>
        <Text className="text-sm text-gray-600 mt-1 mb-4">
          {player.invitePending ? 'An invite is waiting for them. Send it again, or to another address.' : 'They get an email to join the team in the app.'}
        </Text>
        <FormField label="Email" hint={player.email && shownEmail.trim().toLowerCase() !== player.email.toLowerCase() ? 'Not the email on their roster entry.' : undefined}>
          <TextInput
            accessibilityLabel="Email"
            className={inputClass}
            value={shownEmail}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
        </FormField>
        {invite.isError && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
            {describeApiError(invite.error)}
          </Text>
        )}
        <Button label="Send invite" size="lg" disabled={!valid} loading={invite.isPending} onPress={() => invite.mutate(shownEmail.trim())} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
