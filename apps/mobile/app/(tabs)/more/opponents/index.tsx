import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { EmptyState, ErrorState, ListRow } from '@baseball/ui';
import { useCan, useRole } from '../../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../../src/features/teams/TeamSwitcher';
import { ListGroup } from '../../../../src/features/navigation/ListGroup';
import { useOpponentTeams } from '../../../../src/features/opponents/opponent-teams-api';
import { describeApiError } from '../../../../src/lib/api-client';

/**
 * The team's opponent teams (the web /games/opponents): build rosters before
 * games and open each team's scouting card. Coaches only.
 */
export default function OpponentTeamsScreen() {
  const { activeTeam } = useRole();
  const isCoach = useCan('team.coach');
  const query = useOpponentTeams(isCoach ? activeTeam?.teamId : undefined);

  const header = (
    <Stack.Screen
      options={{
        title: 'Opponents',
        headerRight: isCoach
          ? () => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="New opponent team"
                hitSlop={8}
                onPress={() => router.push('/(tabs)/more/opponents/new')}
              >
                <Text className="text-white text-2xl font-semibold">+</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );

  if (!isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <TeamSwitcher />
        <EmptyState title="Coaches only" message="Only coaches can manage opponent teams." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <TeamSwitcher />
      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !query.data ? (
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.opponentTeams.length === 0 ? (
        <EmptyState
          title="No opponent teams yet"
          message="Create opponent teams to build their rosters before games."
          action={{ label: 'New opponent', onPress: () => router.push('/(tabs)/more/opponents/new') }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        >
          <ListGroup>
            {query.data.opponentTeams.map((team) => (
              <ListRow
                key={team.id}
                title={team.abbreviation ? `${team.name} (${team.abbreviation})` : team.name}
                subtitle={[
                  [team.city, team.stateCode].filter(Boolean).join(', '),
                  `${team.playerCount} ${team.playerCount === 1 ? 'player' : 'players'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/more/opponents/[opponentTeamId]', params: { opponentTeamId: team.id } })
                }
              />
            ))}
          </ListGroup>
        </ScrollView>
      )}
    </View>
  );
}
