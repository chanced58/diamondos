import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { EmptyState, ErrorState } from '@baseball/ui';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../../../src/features/teams/TeamSwitcher';
import { DrillBrowser } from '../../../../../src/features/practices/DrillBrowser';
import { useDrills } from '../../../../../src/features/practices/drills-api';
import { describeApiError, isApiError } from '../../../../../src/lib/api-client';

/**
 * The drill library (the web /practices/drills): the curated drills and the
 * team's own, searchable and filtered by source and skill category. Coaches
 * add a team drill from the header. On a plan without practice planning the
 * server refuses, and so does this screen.
 */
export default function DrillLibraryScreen() {
  const { activeTeam, loading: roleLoading } = useRole();
  const query = useDrills(activeTeam?.teamId);
  const isCoach = query.data?.isCoach ?? false;

  const header = (
    <Stack.Screen
      options={{
        title: 'Drill library',
        headerRight: isCoach
          ? () => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="New drill"
                hitSlop={8}
                onPress={() => router.push('/(tabs)/more/practices/drills/new')}
              >
                <Text className="text-white text-2xl font-semibold">+</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );

  if (roleLoading || (activeTeam && query.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!activeTeam) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No team" message="Join a team to see its drill library." />
      </View>
    );
  }
  if (!query.data) {
    const notOnPlan = isApiError(query.error) && query.error.kind === 'forbidden';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <TeamSwitcher />
        {notOnPlan ? (
          <EmptyState title="Drill library" message="The drill library is available on the Starter plan and above." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <TeamSwitcher />
      <DrillBrowser
        drills={query.data.drills}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        onPressDrill={(drill) => router.push({ pathname: '/(tabs)/more/practices/drills/[drillId]', params: { drillId: drill.id } })}
      />
    </View>
  );
}
