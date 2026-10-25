import { useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, FormField } from '@baseball/ui';
import { utcToZonedDateTime } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { DateTimeFields } from '../../../../src/features/forms/DateTimeFields';
import { VenueSearchField } from '../../../../src/features/places/VenueSearchField';
import { createPractice, practicesQueryKey } from '../../../../src/features/practices/practices-api';
import {
  emptyPracticeFormValues,
  practiceInput,
  validatePracticeForm,
  type PracticeFormValues,
} from '../../../../src/features/practices/practice-form-model';
import { deviceTimeZone } from '../../../../src/features/games/game-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** Log a practice (the web's /practices/new). Coaches only; the plan and blocks come after. */
export default function NewPracticeScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() => emptyPracticeFormValues(utcToZonedDateTime(new Date(), deviceTimeZone())));
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (patch: Partial<PracticeFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const create = useMutation({
    mutationFn: () => createPractice(practiceInput(teamId, values, deviceTimeZone())),
    onSuccess: ({ practiceId }) => {
      void queryClient.invalidateQueries({ queryKey: practicesQueryKey(teamId) });
      router.replace({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId } });
    },
  });

  const header = <Stack.Screen options={{ title: 'New practice' }} />;

  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can log practices." />
      </View>
    );
  }

  const submit = () => {
    const problem = validatePracticeForm(teamId, values);
    setValidationError(problem);
    if (!problem) create.mutate();
  };
  const error = validationError ?? (create.isError ? describeApiError(create.error) : null);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {header}
      <FormField label="When" required>
        <DateTimeFields date={values.date} time={values.time} onChange={({ date, time }) => set({ date, time })} testID="practice-start" />
      </FormField>

      <FormField label="Duration (minutes)">
        <TextInput
          accessibilityLabel="Duration in minutes"
          className={inputClass}
          keyboardType="number-pad"
          value={values.duration}
          onChangeText={(duration) => set({ duration })}
          placeholder="120"
          placeholderTextColor="#9ca3af"
        />
      </FormField>

      <FormField label="Location">
        <VenueSearchField value={values.venue} onChange={(venue) => set({ venue })} placeholder="e.g. Main field" />
      </FormField>

      <View className="flex-row items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-4">
        <View className="flex-1 mr-3">
          <Text className="text-base text-gray-900">Notify team</Text>
          <Text className="text-xs text-gray-500">Post the practice to the announcements channel.</Text>
        </View>
        <Switch accessibilityLabel="Notify team" value={values.notifyTeam} onValueChange={(notifyTeam) => set({ notifyTeam })} />
      </View>

      {error && (
        <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <Text accessibilityRole="alert" className="text-sm text-red-700">{error}</Text>
        </View>
      )}

      <Button label="Create practice" size="lg" loading={create.isPending} onPress={submit} />
    </ScrollView>
  );
}
