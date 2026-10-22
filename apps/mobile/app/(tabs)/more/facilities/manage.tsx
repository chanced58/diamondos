import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField, SectionHeader } from '@baseball/ui';
import { FACILITY_KINDS, FACILITY_KIND_LABELS, type Facility, type FacilityKind } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import {
  createFacility,
  deleteFacility,
  facilitiesQueryKey,
  useFacilitySchedule,
} from '../../../../src/features/facilities/facilities-api';
import { startOfWeek, weekWindow } from '../../../../src/features/facilities/facility-schedule-model';
import { describeApiError } from '../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** Add and remove the team's facilities (the web's FacilityManager). Coaches only. */
export default function ManageFacilitiesScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const queryClient = useQueryClient();
  const window = useMemo(() => weekWindow(startOfWeek(new Date())), []);
  const schedule = useFacilitySchedule(teamId || undefined, window);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<FacilityKind>('cage');
  const [capacity, setCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: facilitiesQueryKey(teamId) });
  const add = useMutation({
    mutationFn: () =>
      createFacility(teamId, {
        name: name.trim(),
        kind,
        capacity: capacity.trim() ? Number(capacity) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: async () => {
      setName('');
      setCapacity('');
      setNotes('');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (facilityId: string) => deleteFacility(teamId, facilityId),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Could not delete the facility', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'Manage facilities' }} />;

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
  if (!schedule.data.canManage) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can manage facilities." />
      </View>
    );
  }

  const confirmDelete = (facility: Facility) =>
    Alert.alert(`Delete ${facility.name}?`, 'Its bookings are deleted with it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(facility.id) },
    ]);

  const submit = () => {
    const capacityValue = capacity.trim() ? Number(capacity) : null;
    const issue = !name.trim()
      ? 'Name is required.'
      : capacityValue !== null && (!Number.isInteger(capacityValue) || capacityValue < 1)
        ? 'Capacity must be a positive whole number.'
        : null;
    setProblem(issue);
    if (!issue) add.mutate();
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {header}
      <SectionHeader title={`Facilities (${schedule.data.facilities.length})`} />
      <View className="bg-white border border-gray-200 rounded-xl">
        {schedule.data.facilities.length === 0 ? (
          <Text className="text-sm text-gray-500 p-4">No facilities yet.</Text>
        ) : (
          schedule.data.facilities.map((facility, index) => (
            <View key={facility.id} className={`flex-row items-center px-4 py-3 ${index > 0 ? 'border-t border-gray-100' : ''}`}>
              <View className="flex-1 pr-2">
                <Text className="text-sm font-semibold text-gray-900">
                  {facility.name}
                  {!facility.isActive && <Text className="text-xs font-normal text-gray-400">  inactive</Text>}
                </Text>
                <Text className="text-xs text-gray-500">
                  {FACILITY_KIND_LABELS[facility.kind]}
                  {facility.capacity !== null ? ` · holds ${facility.capacity}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Delete ${facility.name}`}
                onPress={() => confirmDelete(facility)}
                className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200"
              >
                <Text className="text-xs font-semibold text-red-700">Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <SectionHeader title="Add a facility" />
      <View className="bg-white border border-gray-200 rounded-xl p-4">
        <FormField label="Name" required>
          <TextInput accessibilityLabel="Facility name" className={inputClass} value={name} onChangeText={setName} placeholder="e.g. Cage 1" placeholderTextColor="#9ca3af" />
        </FormField>
        <FormField label="Kind" required>
          <View className="flex-row flex-wrap gap-2">
            {FACILITY_KINDS.map((value) => {
              const selected = value === kind;
              return (
                <TouchableOpacity
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setKind(value)}
                  className={`px-3 py-1.5 rounded-full border ${selected ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}
                >
                  <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>{FACILITY_KIND_LABELS[value]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FormField>
        <FormField label="Capacity">
          <TextInput accessibilityLabel="Capacity" className={inputClass} value={capacity} onChangeText={setCapacity} placeholder="Optional" placeholderTextColor="#9ca3af" keyboardType="number-pad" />
        </FormField>
        <FormField label="Notes">
          <TextInput accessibilityLabel="Notes" className={inputClass} value={notes} onChangeText={setNotes} placeholder="Optional" placeholderTextColor="#9ca3af" />
        </FormField>
        {(problem ?? (add.isError ? describeApiError(add.error) : null)) && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">{problem ?? describeApiError(add.error)}</Text>
        )}
        <Button label="Add facility" loading={add.isPending} onPress={submit} />
      </View>
    </ScrollView>
  );
}
