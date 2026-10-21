import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { formatInTimeZone, type TeamEventType } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { ListGroup } from '../../../../src/features/navigation/ListGroup';
import { deleteTeamEvent, fetchTeamEvent, teamEventQueryKey } from '../../../../src/features/events/team-events-api';
import { EVENT_TYPE_LABELS } from '../../../../src/features/events/event-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

const WHEN = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' } as const;

/** A team event (the web's /games/events/[eventId]); coaches can delete it. */
export default function TeamEventScreen() {
  const { eventId = '' } = useLocalSearchParams<{ eventId: string }>();
  const { memberships } = useRole();
  const event = useQuery({ queryKey: teamEventQueryKey(eventId), queryFn: () => fetchTeamEvent(eventId), enabled: eventId.length > 0 });

  const remove = useMutation({
    mutationFn: () => deleteTeamEvent(eventId),
    onSuccess: () => router.back(),
    onError: (error) => Alert.alert('Could not delete the event', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'Team event' }} />;

  if (event.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (event.isError) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(event.error)} onRetry={() => void event.refetch()} />
      </View>
    );
  }
  if (!event.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Event not found" message="It may have been deleted." />
      </View>
    );
  }

  const data = event.data;
  const isCoach = memberships.some((m) => m.teamId === data.teamId && m.isCoach);
  const typeLabel = EVENT_TYPE_LABELS[data.eventType as TeamEventType] ?? 'Event';

  const confirmDelete = () =>
    Alert.alert('Delete this event?', 'It is removed from the team schedule.', [
      { text: 'Keep event', style: 'cancel' },
      { text: 'Delete event', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  const openMap = () => {
    if (data.latitude === null || data.longitude === null) return;
    const label = encodeURIComponent(data.location ?? data.title);
    void Linking.openURL(
      Platform.select({
        ios: `https://maps.apple.com/?ll=${data.latitude},${data.longitude}&q=${label}`,
        default: `geo:${data.latitude},${data.longitude}?q=${data.latitude},${data.longitude}(${label})`,
      }),
    );
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <View className="flex-row items-start justify-between gap-3">
        <Text accessibilityRole="header" className="flex-1 text-2xl font-bold text-gray-900">{data.title}</Text>
        <Badge label={typeLabel} />
      </View>
      <Text className="text-sm text-gray-500 mt-1">
        {formatInTimeZone(data.startsAt, null, WHEN)}
        {data.endsAt ? ` – ${formatInTimeZone(data.endsAt, null, WHEN)}` : ''}
      </Text>

      {(data.location || data.description) && (
        <>
          <SectionHeader title="Details" />
          <ListGroup>
            {data.location && <ListRow title="Location" subtitle={data.address ?? data.location} />}
            {data.latitude !== null && data.longitude !== null && <ListRow title="Open in Maps" onPress={openMap} />}
            {data.description && <ListRow title="Description" subtitle={data.description} />}
          </ListGroup>
        </>
      )}

      {isCoach && (
        <>
          <SectionHeader title="Danger zone" />
          <Button variant="danger" label="Delete event" loading={remove.isPending} onPress={confirmDelete} />
        </>
      )}
    </ScrollView>
  );
}
