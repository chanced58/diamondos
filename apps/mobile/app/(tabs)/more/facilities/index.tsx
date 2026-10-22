import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { FACILITY_KIND_LABELS, type FacilityBooking } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../../src/features/teams/TeamSwitcher';
import {
  deleteBooking,
  facilitiesQueryKey,
  useFacilitySchedule,
} from '../../../../src/features/facilities/facilities-api';
import {
  addWeeks,
  bookingsByDay,
  isSameLocalDay,
  startOfWeek,
  timeRange,
  weekWindow,
} from '../../../../src/features/facilities/facility-schedule-model';
import { describeApiError } from '../../../../src/lib/api-client';

/**
 * The team's facility bookings by week (the web /schedule). Everyone on the
 * team reads it; coaches book facilities and manage the list. The database
 * rejects two overlapping bookings on one facility.
 */
export default function FacilitiesScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId;
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const window = useMemo(() => weekWindow(weekStart), [weekStart]);
  const query = useFacilitySchedule(teamId, window);
  const canManage = query.data?.canManage ?? false;

  const remove = useMutation({
    mutationFn: (bookingId: string) => deleteBooking(teamId ?? '', bookingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: facilitiesQueryKey(teamId ?? '') }),
    onError: (error) => Alert.alert('Could not delete the booking', describeApiError(error)),
  });

  const header = (
    <Stack.Screen
      options={{
        title: 'Facilities',
        headerRight: canManage
          ? () => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Book a facility"
                hitSlop={8}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/more/facilities/new-booking', params: { day: weekStart.toISOString() } })
                }
              >
                <Text className="text-white text-2xl font-semibold">+</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );

  if (!teamId) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No team" message="Join a team to see its facilities." />
      </View>
    );
  }

  const facilityName = (id: string) => query.data?.facilities.find((f) => f.id === id)?.name ?? 'Facility';
  const confirmDelete = (booking: FacilityBooking) =>
    Alert.alert('Delete this booking?', `${booking.title} · ${facilityName(booking.facilityId)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(booking.id) },
    ]);

  const today = new Date();
  const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <TeamSwitcher />
      <View className="flex-row items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous week" hitSlop={8} onPress={() => setWeekStart(addWeeks(weekStart, -1))}>
          <Text className="text-blue-700 text-base">‹ Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="This week" onPress={() => setWeekStart(startOfWeek(new Date()))}>
          <Text className="text-sm font-semibold text-gray-900">Week of {weekLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next week" hitSlop={8} onPress={() => setWeekStart(addWeeks(weekStart, 1))}>
          <Text className="text-blue-700 text-base">Next ›</Text>
        </TouchableOpacity>
      </View>

      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !query.data ? (
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        >
          {query.data.facilities.length === 0 && (
            <Text className="text-sm text-gray-500 mb-4">
              {canManage ? 'No facilities yet. Add your cages, fields and bullpens below.' : 'This team has no facilities yet.'}
            </Text>
          )}

          {bookingsByDay(weekStart, query.data.bookings).map((day) => (
            <View key={day.date.toISOString()} className="mb-3">
              <Text
                className={`text-xs font-semibold uppercase tracking-wide mb-1.5 px-1 ${
                  isSameLocalDay(day.date, today) ? 'text-blue-700' : 'text-gray-500'
                }`}
              >
                {day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              {day.bookings.length === 0 ? (
                <Text className="text-sm text-gray-400 px-1">No bookings</Text>
              ) : (
                <View className="bg-white border border-gray-200 rounded-xl">
                  {day.bookings.map((booking, index) => (
                    <TouchableOpacity
                      key={booking.id}
                      accessibilityRole={canManage ? 'button' : undefined}
                      accessibilityHint={canManage ? 'Long press to delete' : undefined}
                      disabled={!canManage}
                      onLongPress={() => confirmDelete(booking)}
                      className={`px-4 py-3 ${index > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-semibold text-gray-900 flex-1" numberOfLines={1}>{booking.title}</Text>
                        <Text className="text-xs text-gray-500 ml-2">{timeRange(booking.startsAt, booking.endsAt)}</Text>
                      </View>
                      <Text className="text-xs text-gray-500 mt-0.5">{facilityName(booking.facilityId)}</Text>
                      {booking.notes && <Text className="text-xs text-gray-400 mt-0.5">{booking.notes}</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}

          {canManage && (
            <>
              <Text className="text-xs text-gray-400 px-1 mb-2">Long press a booking to delete it.</Text>
              <SectionHeader title="Facilities" />
              <View className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <ListRow
                  title="Manage facilities"
                  subtitle={
                    query.data.facilities.length > 0
                      ? query.data.facilities.map((f) => `${f.name} (${FACILITY_KIND_LABELS[f.kind]})`).join(', ')
                      : 'Add cages, fields and bullpens'
                  }
                  onPress={() => router.push('/(tabs)/more/facilities/manage')}
                />
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
