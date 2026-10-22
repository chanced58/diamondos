import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import type { OpponentTeamPlayer } from '@baseball/shared';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { ListGroup } from '../../../../../src/features/navigation/ListGroup';
import { OpponentPlayerSheet } from '../../../../../src/features/opponents/OpponentPlayerSheet';
import { positionLabel } from '../../../../../src/features/opponents/opponent-lineup-model';
import {
  addOpponentTeamPlayer,
  opponentTeamQueryKey,
  opponentTeamsQueryKey,
  removeOpponentTeamPlayer,
  updateOpponentTeamPlayer,
  useOpponentTeam,
  type OpponentTeamPlayerFields,
} from '../../../../../src/features/opponents/opponent-teams-api';
import { describeApiError } from '../../../../../src/lib/api-client';

/** "L/R" for bats/throws, "-" for an unknown hand (the web roster's column). */
function hands(player: OpponentTeamPlayer): string | null {
  if (!player.bats && !player.throws) return null;
  return `${player.bats?.[0]?.toUpperCase() ?? '-'}/${player.throws?.[0]?.toUpperCase() ?? '-'}`;
}

/**
 * One opponent team (the web /games/opponents/[id]): its details, its roster
 * — tap to edit, long press to remove — and its scouting card. Coaches only.
 */
export default function OpponentTeamScreen() {
  const { opponentTeamId = '' } = useLocalSearchParams<{ opponentTeamId: string }>();
  const { activeTeam } = useRole();
  const query = useOpponentTeam(opponentTeamId);
  const queryClient = useQueryClient();
  // undefined: closed; null: adding; a player: editing.
  const [editing, setEditing] = useState<OpponentTeamPlayer | null | undefined>(undefined);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: opponentTeamQueryKey(opponentTeamId) });
    if (activeTeam) void queryClient.invalidateQueries({ queryKey: opponentTeamsQueryKey(activeTeam.teamId) });
  };
  const save = useMutation({
    mutationFn: (fields: OpponentTeamPlayerFields) =>
      editing
        ? updateOpponentTeamPlayer(opponentTeamId, editing.id, fields)
        : addOpponentTeamPlayer(opponentTeamId, fields),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (playerId: string) => removeOpponentTeamPlayer(opponentTeamId, playerId),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Could not remove the player', describeApiError(error)),
  });

  const team = query.data?.team;
  const header = (
    <Stack.Screen
      options={{
        title: team?.name ?? 'Opponent',
        headerRight: team
          ? () => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Edit team details"
                hitSlop={8}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/more/opponents/[opponentTeamId]/edit', params: { opponentTeamId } })
                }
              >
                <Text className="text-white text-base font-semibold">Edit</Text>
              </TouchableOpacity>
            )
          : undefined,
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
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const { players, priorGames } = query.data;
  const place = [query.data.team.city, query.data.team.stateCode].filter(Boolean).join(', ');
  const confirmRemove = (player: OpponentTeamPlayer) =>
    Alert.alert(`Remove ${player.firstName} ${player.lastName}?`, 'Their recorded stats stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(player.id) },
    ]);

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <Text className="text-sm text-gray-500 mb-3">
          {[place, `${priorGames} ${priorGames === 1 ? 'game' : 'games'} against them`].filter(Boolean).join(' · ')}
        </Text>

        <ListGroup>
          <ListRow
            title="Scouting card"
            subtitle="AI read on their hitters and pitchers from your past games"
            onPress={() =>
              router.push({ pathname: '/(tabs)/more/opponents/[opponentTeamId]/card', params: { opponentTeamId } })
            }
          />
        </ListGroup>

        <SectionHeader title={`Roster (${players.length})`} />
        {players.length === 0 ? (
          <Text className="text-sm text-gray-500 mb-3 px-1">No players yet. Add the hitters and pitchers you know.</Text>
        ) : (
          <View className="mb-1">
            <ListGroup>
              {players.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  accessibilityRole="button"
                  accessibilityHint="Long press to remove"
                  onPress={() => setEditing(player)}
                  onLongPress={() => confirmRemove(player)}
                  className="px-4 py-3 bg-white"
                >
                  <Text className="text-sm font-semibold text-gray-900">
                    {player.jerseyNumber ? `#${player.jerseyNumber} ` : ''}
                    {player.firstName} {player.lastName}
                  </Text>
                  <Text className="text-xs text-gray-500 mt-0.5">
                    {[positionLabel(player.primaryPosition), hands(player)].filter(Boolean).join(' · ') || 'No position'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ListGroup>
            <Text className="text-xs text-gray-400 mt-2 px-1">Tap a player to edit; long press to remove.</Text>
          </View>
        )}
        <View className="mt-3">
          <Button label="Add player" variant="secondary" onPress={() => setEditing(null)} />
        </View>
      </ScrollView>

      <OpponentPlayerSheet
        visible={editing !== undefined}
        player={editing ?? null}
        withHandedness
        saving={save.isPending}
        error={save.error ? describeApiError(save.error) : null}
        onSave={(fields) => save.mutate(fields)}
        onClose={() => {
          setEditing(undefined);
          save.reset();
        }}
      />
    </View>
  );
}
