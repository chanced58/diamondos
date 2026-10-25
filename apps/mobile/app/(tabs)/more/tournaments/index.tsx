import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Badge, EmptyState, ErrorState, ListRow } from '@baseball/ui';
import { useTournaments } from '../../../../src/features/tournaments/tournaments-api';
import { statusLabel, tournamentDates } from '../../../../src/features/tournaments/tournament-format';

/**
 * The tournaments the user can see (the web /tournaments list), newest first.
 * Anyone may start one from the header: for a team they head, or as a new
 * tournament team; the server decides.
 */
export default function TournamentsScreen() {
  const query = useTournaments();

  const header = (
    <Stack.Screen
      options={{
        title: 'Tournaments',
        headerRight: () => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="New tournament"
            hitSlop={8}
            onPress={() => router.push('/(tabs)/more/tournaments/new')}
          >
            <Text className="text-white text-2xl font-semibold">+</Text>
          </TouchableOpacity>
        ),
      }}
    />
  );

  if (query.isPending) {
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
        <ErrorState message={query.error instanceof Error ? query.error.message : 'Something went wrong.'} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <FlatList
        data={query.data}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        renderItem={({ item }) => (
          <View className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2">
            <ListRow
              title={item.name}
              subtitle={tournamentDates(item.startDate, item.endDate)}
              right={<Badge label={statusLabel(item.status)} variant="warning" />}
              onPress={() => router.push({ pathname: '/(tabs)/more/tournaments/[tournamentId]', params: { tournamentId: item.id } })}
            />
          </View>
        )}
        ListEmptyComponent={<EmptyState title="No tournaments yet" message="Tap + to set one up for your team or a separate tournament team." />}
      />
    </View>
  );
}
