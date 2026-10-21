import { useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, EmptyState, FormField, SegmentedControl } from '@baseball/ui';
import { TEAM_EVENT_TYPES, utcToZonedDateTime } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { DateTimeFields } from '../../../../src/features/forms/DateTimeFields';
import { VenueSearchField } from '../../../../src/features/places/VenueSearchField';
import { createTeamEvent } from '../../../../src/features/events/team-events-api';
import {
  EVENT_TYPE_LABELS,
  emptyEventFormValues,
  teamEventInput,
  validateEventForm,
  type EventFormValues,
} from '../../../../src/features/events/event-form-model';
import { deviceTimeZone } from '../../../../src/features/games/game-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

const TYPE_OPTIONS = TEAM_EVENT_TYPES.map((value) => ({
  value,
  label: value === 'meeting' ? 'Meeting' : EVENT_TYPE_LABELS[value],
}));

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** Add a team event — meeting, scrimmage, travel… (the web's /games/events/new). Coaches only. */
export default function NewTeamEventScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const [values, setValues] = useState(() => emptyEventFormValues(utcToZonedDateTime(new Date(), deviceTimeZone())));
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (patch: Partial<EventFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const create = useMutation({
    mutationFn: () => createTeamEvent(teamEventInput(teamId, values, deviceTimeZone())),
    onSuccess: ({ eventId }) => router.replace({ pathname: '/(tabs)/schedule/events/[eventId]', params: { eventId } }),
  });

  const header = <Stack.Screen options={{ title: 'Add team event' }} />;

  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can add team events." />
      </View>
    );
  }

  const submit = () => {
    const problem = validateEventForm(teamId, values);
    setValidationError(problem);
    if (!problem) create.mutate();
  };
  const error = validationError ?? (create.isError ? describeApiError(create.error) : null);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {header}
      <FormField label="Title" required>
        <TextInput
          accessibilityLabel="Title"
          className={inputClass}
          placeholder="e.g. Team dinner"
          placeholderTextColor="#9ca3af"
          value={values.title}
          onChangeText={(title) => set({ title })}
        />
      </FormField>

      <FormField label="Type">
        <SegmentedControl options={TYPE_OPTIONS} value={values.eventType} onChange={(eventType) => set({ eventType })} />
      </FormField>

      <FormField label="Starts" required>
        <DateTimeFields
          date={values.startDate}
          time={values.startTime}
          onChange={({ date, time }) => set({ startDate: date, startTime: time })}
          testID="event-start"
        />
      </FormField>

      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium text-gray-700">Has an end time</Text>
        <Switch accessibilityLabel="Has an end time" value={values.hasEnd} onValueChange={(hasEnd) => set({ hasEnd })} />
      </View>
      {values.hasEnd && (
        <FormField label="Ends">
          <DateTimeFields
            date={values.endDate}
            time={values.endTime}
            onChange={({ date, time }) => set({ endDate: date, endTime: time })}
            testID="event-end"
          />
        </FormField>
      )}

      <FormField label="Location">
        <VenueSearchField value={values.venue} onChange={(venue) => set({ venue })} placeholder="e.g. Team clubhouse" />
      </FormField>

      <FormField label="Description">
        <TextInput
          accessibilityLabel="Description"
          className={`${inputClass} min-h-[80px]`}
          multiline
          textAlignVertical="top"
          value={values.description}
          onChangeText={(description) => set({ description })}
        />
      </FormField>

      <View className="flex-row items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-4">
        <View className="flex-1 mr-3">
          <Text className="text-base text-gray-900">Notify team</Text>
          <Text className="text-xs text-gray-500">Post the event to the announcements channel.</Text>
        </View>
        <Switch accessibilityLabel="Notify team" value={values.notifyTeam} onValueChange={(notifyTeam) => set({ notifyTeam })} />
      </View>

      {error && (
        <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <Text accessibilityRole="alert" className="text-sm text-red-700">{error}</Text>
        </View>
      )}

      <Button label="Add event" size="lg" loading={create.isPending} onPress={submit} />
    </ScrollView>
  );
}
