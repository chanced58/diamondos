import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, FormField } from '@baseball/ui';
import { STAFF_INVITE_ROLES, TEAM_ROLE_LABELS } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { ChoiceChips } from '../../../../src/features/practices/ChoiceChips';
import { useDiscardGuard } from '../../../../src/features/forms/use-discard-guard';
import { inviteStaff, teamMembersQueryKey, type StaffInvite } from '../../../../src/features/members/members-api';
import {
  emptyStaffInvite,
  inviteOutcomeMessage,
  toStaffInvite,
  type StaffInviteValues,
} from '../../../../src/features/members/invite-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/**
 * Invite a coach or staff member (the roster's Invite staff form). With an
 * email, an existing account joins at once and a new one gets an invite;
 * without one, they're recorded by name.
 */
export default function InviteStaffScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const queryClient = useQueryClient();
  const [values, setValues] = useState<StaffInviteValues>(emptyStaffInvite);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<StaffInviteValues>) => {
    setProblem(null);
    setValues((current) => ({ ...current, ...patch }));
  };

  const invite = useMutation({
    mutationFn: (staff: StaffInvite) => inviteStaff(teamId, staff),
    onSuccess: (result, staff) => {
      void queryClient.invalidateQueries({ queryKey: teamMembersQueryKey(teamId) });
      Alert.alert(result.outcome === 'invited' ? 'Invite sent' : 'Added', inviteOutcomeMessage(result, staff.email));
    },
  });
  useDiscardGuard(!invite.isSuccess && JSON.stringify(values) !== JSON.stringify(emptyStaffInvite));

  // Go back after the render that drops the discard guard.
  const done = invite.isSuccess;
  useEffect(() => {
    if (done) router.back();
  }, [done]);

  const header = <Stack.Screen options={{ title: 'Invite staff' }} />;
  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Head coaches, assistants and athletic directors invite staff." />
      </View>
    );
  }

  const submit = () => {
    const result = toStaffInvite(values);
    if ('error' in result) return setProblem(result.error);
    invite.mutate(result.invite);
  };
  const error = problem ?? (invite.isError ? describeApiError(invite.error) : null);

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <FormField label="Role" required>
          <ChoiceChips
            options={STAFF_INVITE_ROLES}
            labels={TEAM_ROLE_LABELS}
            selected={values.role ? [values.role as (typeof STAFF_INVITE_ROLES)[number]] : []}
            onChange={(picked) => set({ role: picked.find((r) => r !== values.role) ?? null })}
          />
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
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="Phone">
              <TextInput accessibilityLabel="Phone" className={inputClass} value={values.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" maxLength={30} />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Jersey #">
              <TextInput accessibilityLabel="Jersey number" className={inputClass} value={values.jerseyNumber} onChangeText={(jerseyNumber) => set({ jerseyNumber })} keyboardType="number-pad" maxLength={2} />
            </FormField>
          </View>
        </View>
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
