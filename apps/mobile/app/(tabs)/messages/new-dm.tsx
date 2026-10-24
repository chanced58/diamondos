import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { EmptyState, ErrorState, ListRow } from '@baseball/ui';
import { Feature } from '@baseball/shared';
import { useCan, useRole } from '../../../src/providers/RoleProvider';
import { useSyncContext } from '../../../src/providers/SyncProvider';
import { ListGroup } from '../../../src/features/navigation/ListGroup';
import { roleBadge } from '../../../src/features/messaging/role-badges';
import { startDirectMessage, useDmCandidates } from '../../../src/features/messaging/messaging-api';
import { describeApiError } from '../../../src/lib/api-client';

/**
 * Pick a teammate to message (the web New Direct Message page). Opens the DM
 * you already have with them, or starts one. Needs direct messages on the
 * team's plan.
 */
export default function NewDirectMessageScreen() {
  const { activeTeam } = useRole();
  const canDms = useCan(Feature.DIRECT_MESSAGES);
  const teamId = canDms ? activeTeam?.teamId : undefined;
  const query = useDmCandidates(teamId);
  const { triggerSync } = useSyncContext();

  const start = useMutation({
    mutationFn: (targetUserId: string) => startDirectMessage(teamId ?? '', targetUserId),
    onSuccess: async ({ channelId }) => {
      await triggerSync();
      router.replace({ pathname: '/(tabs)/messages/[channelId]', params: { channelId } });
    },
    onError: (error) => Alert.alert('Could not open the conversation', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'New message' }} />;

  if (!teamId) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Direct messages aren't on this plan" message="Ask a coach about upgrading the team's plan." />
      </View>
    );
  }
  if (query.isPending || start.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }
  if (query.data.people.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No one to message yet" message="Teammates appear here once they've joined the team." />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <ListGroup>
        {query.data.people.map((person) => (
          <ListRow
            key={person.userId}
            title={`${person.firstName} ${person.lastName}`}
            subtitle={roleBadge(person.role)?.label}
            onPress={() => start.mutate(person.userId)}
          />
        ))}
      </ListGroup>
    </ScrollView>
  );
}
