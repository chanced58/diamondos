import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { FACILITY_KIND_LABELS } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { DateTimeFields } from '../../../../src/features/forms/DateTimeFields';
import {
  createBooking,
  facilitiesQueryKey,
  useFacilitySchedule,
} from '../../../../src/features/facilities/facilities-api';
import {
  addWeeks,
  bookingFormDefaults,
  bookingInput,
  startOfWeek,
  validateBookingForm,
  weekWindow,
  type BookingFormValues,
} from '../../../../src/features/facilities/facility-schedule-model';
import { describeApiError } from '../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** Book one of the team's facilities (the web's NewBookingForm). Coaches only. */
export default function NewBookingScreen() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const queryClient = useQueryClient();

  // Default to today when booking from this week, else the week's Sunday.
  const firstDay = useMemo(() => {
    const weekStart = startOfWeek(day ? new Date(day) : new Date());
    const now = new Date();
    return now >= weekStart && now < addWeeks(weekStart, 1) ? now : weekStart;
  }, [day]);
  const schedule = useFacilitySchedule(teamId || undefined, weekWindow(startOfWeek(firstDay)));
  const [values, setValues] = useState<BookingFormValues>(() => bookingFormDefaults(firstDay));
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<BookingFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const save = useMutation({
    mutationFn: () => createBooking(teamId, bookingInput(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: facilitiesQueryKey(teamId) });
      router.back();
    },
  });

  const header = <Stack.Screen options={{ title: 'Book a facility' }} />;

  if (schedule.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!schedule.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(schedule.error)} onRetry={() => void schedule.refetch()} />
      </View>
    );
  }
  const facilities = schedule.data.facilities.filter((f) => f.isActive);
  if (!schedule.data.canManage || facilities.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState
          title={schedule.data.canManage ? 'No facilities' : 'Coaches only'}
          message={schedule.data.canManage ? 'Add a facility before booking one.' : 'Only coaches can book facilities.'}
        />
      </View>
    );
  }

  const submit = () => {
    const issue = validateBookingForm(values);
    setProblem(issue);
    if (!issue) save.mutate();
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {header}
      <FormField label="Facility" required>
        <View className="flex-row flex-wrap gap-2">
          {facilities.map((facility) => {
            const selected = facility.id === values.facilityId;
            return (
              <TouchableOpacity
                key={facility.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => set({ facilityId: facility.id })}
                className={`px-3 py-2 rounded-lg border ${selected ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}
              >
                <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-800'}`}>{facility.name}</Text>
                <Text className={`text-xs ${selected ? 'text-blue-100' : 'text-gray-500'}`}>{FACILITY_KIND_LABELS[facility.kind]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FormField>

      <FormField label="Starts" required>
        <DateTimeFields date={values.date} time={values.startTime} onChange={({ date, time }) => set({ date, startTime: time })} testID="booking-start" />
      </FormField>
      <FormField label="Ends" required hint="Same day as the start.">
        <DateTimeFields date={values.date} time={values.endTime} showDate={false} onChange={({ time }) => set({ endTime: time })} testID="booking-end" />
      </FormField>

      <FormField label="Title" required>
        <TextInput
          accessibilityLabel="Title"
          className={inputClass}
          value={values.title}
          onChangeText={(title) => set({ title })}
          placeholder="e.g. Varsity hitting"
          placeholderTextColor="#9ca3af"
        />
      </FormField>
      <FormField label="Notes">
        <TextInput
          accessibilityLabel="Notes"
          className={inputClass}
          value={values.notes}
          onChangeText={(notes) => set({ notes })}
          placeholder="Optional"
          placeholderTextColor="#9ca3af"
          multiline
        />
      </FormField>

      {(problem ?? (save.isError ? describeApiError(save.error) : null)) && (
        <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
          {problem ?? describeApiError(save.error)}
        </Text>
      )}
      <Button label="Book" size="lg" loading={save.isPending} onPress={submit} />
    </ScrollView>
  );
}
