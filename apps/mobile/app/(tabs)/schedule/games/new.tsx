import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@baseball/ui';
import { useRole } from '../../../../src/providers/RoleProvider';
import { useSyncContext } from '../../../../src/providers/SyncProvider';
import { GameForm } from '../../../../src/features/games/GameForm';
import { createGame, fetchGameFormOptions, gameFormOptionsQueryKey } from '../../../../src/features/games/game-form-api';
import { emptyGameFormValues, gameFormFields, type GameFormValues } from '../../../../src/features/games/game-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

/**
 * Schedule a game (the web's /games/new). Coaches only. From a tournament it
 * schedules a game for the tournament's team, which may not be the active
 * team (the web's /games/new?tournamentId=); the server scopes it to the
 * tournament's season.
 */
export default function NewGameScreen() {
  const params = useLocalSearchParams<{ tournamentId?: string; teamId?: string; tournamentName?: string }>();
  const { activeTeam, memberships } = useRole();
  const { triggerSync } = useSyncContext();
  const tournamentId = params.tournamentId || null;
  const team = tournamentId && params.teamId ? memberships.find((m) => m.teamId === params.teamId) : activeTeam;
  const teamId = team?.teamId ?? '';
  const [initialValues] = useState(() => emptyGameFormValues());

  const options = useQuery({
    queryKey: gameFormOptionsQueryKey(teamId),
    queryFn: () => fetchGameFormOptions(teamId),
    enabled: Boolean(team?.isCoach),
  });

  const create = useMutation({
    mutationFn: (values: GameFormValues) =>
      createGame({ teamId, tournamentId, notifyTeam: values.notifyTeam, ...gameFormFields(values) }),
    onSuccess: ({ gameId }) => {
      // The Games list reads the offline mirror; pull the new game now.
      void triggerSync();
      router.replace({ pathname: '/(tabs)/schedule/games/[gameId]', params: { gameId } });
    },
  });

  const header = <Stack.Screen options={{ title: tournamentId ? 'Add tournament game' : 'Schedule a game' }} />;

  if (!team?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message={`Only coaches can schedule games${team ? ` for ${team.teamName}` : ''}.`} />
      </View>
    );
  }
  if (options.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (options.isError) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(options.error)} onRetry={() => void options.refetch()} />
      </View>
    );
  }

  return (
    <>
      {header}
      {tournamentId && (
        <View className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <Text className="text-sm text-amber-900">
            {params.tournamentName ? `${params.tournamentName} · ` : ''}
            {team.teamName}
          </Text>
        </View>
      )}
      <GameForm
        mode="create"
        initialValues={initialValues}
        opponentTeams={options.data.opponentTeams}
        submitting={create.isPending}
        submitError={create.isError ? describeApiError(create.error) : null}
        onSubmit={(values) => create.mutate(values)}
      />
    </>
  );
}
