import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { useRole } from '../../../../src/providers/RoleProvider';
import { ChoiceChips } from '../../../../src/features/practices/ChoiceChips';
import { useDiscardGuard } from '../../../../src/features/forms/use-discard-guard';
import { inviteParent, teamMembersQueryKey, useTeamMembers, type ParentInvite } from '../../../../src/features/members/members-api';
import {
  emptyParentInvite,
  inviteOutcomeMessage,
  toParentInvite,
  type ParentInviteValues,
} from '../../../../src/features/members/invite-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/**
 * Invite a parent for their children on the roster (the roster's Invite
 * parent form). The children are recorded on the invitation: accepting it
 * links the parent to exactly them.
 */
export default function InviteParentScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const members = useTeamMembers(teamId);
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ParentInviteValues>(emptyParentInvite);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<ParentInviteValues>) => {
    setProblem(null);
    setValues((current) => ({ ...current, ...patch }));
  };

  const invite = useMutation({
    mutationFn: (parent: ParentInvite) => inviteParent(teamId as string, parent),
    onSuccess: (result, parent) => {
      void queryClient.invalidateQueries({ queryKey: teamMembersQueryKey(teamId ?? '') });
      Alert.alert(result.outcome === 'invited' ? 'Invite sent' : 'Added', inviteOutcomeMessage(result, parent.email));
    },
  });
  useDiscardGuard(!invite.isSuccess && JSON.stringify(values) !== JSON.stringify(emptyParentInvite));

  const done = invite.isSuccess;
  useEffect(() => {
    if (done) router.back();
  }, [done]);

  const header = <Stack.Screen options={{ title: 'Invite a parent' }} />;
  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Head coaches, assistants and athletic directors invite parents." />
      </View>
    );
  }
  if (members.isPending) {
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

  const players = members.data.players;
  const submit = () => {
    const result = toParentInvite(values);
    if ('error' in result) return setProblem(result.error);
    invite.mutate(result.invite);
  };
  const error = problem ?? (invite.isError ? describeApiError(invite.error) : null);

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <FormField label="Their children" required hint="A parent sees their children’s schedule, RSVPs and notes.">
          {players.length === 0 ? (
            <Text className="text-sm text-gray-500">Add players to the roster first.</Text>
          ) : (
            <ChoiceChips
              options={players.map((p) => p.playerId)}
              labels={Object.fromEntries(players.map((p) => [p.playerId, `${p.firstName} ${p.lastName}`]))}
              selected={values.playerIds}
              onChange={(playerIds) => set({ playerIds })}
            />
          )}
        </FormField>
        <FormField label="Email" hint="Leave it blank to record them by name only.">
          <TextInput
            accessibilityLabel="Email"
            className={inputClass}
            value={values.email}
            onChangeText={(email) => set({ email })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
        </FormField>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="First name">
              <TextInput accessibilityLabel="First name" className={inputClass} value={values.firstName} onChangeText={(firstName) => set({ firstName })} maxLength={50} />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Last name">
              <TextInput accessibilityLabel="Last name" className={inputClass} value={values.lastName} onChangeText={(lastName) => set({ lastName })} maxLength={50} />
            </FormField>
          </View>
        </View>
        <FormField label="Phone">
          <TextInput accessibilityLabel="Phone" className={inputClass} value={values.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" maxLength={30} />
        </FormField>
        {error && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
            {error}
          </Text>
        )}
        <Button label={values.email.trim() ? 'Send invite' : 'Add to the team'} size="lg" loading={invite.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
