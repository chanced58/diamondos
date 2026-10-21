import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@baseball/ui';
import { useRole } from '../../../../src/providers/RoleProvider';
import { useSyncContext } from '../../../../src/providers/SyncProvider';
import { GameForm } from '../../../../src/features/games/GameForm';
import { createGame, fetchGameFormOptions, gameFormOptionsQueryKey } from '../../../../src/features/games/game-form-api';
import { emptyGameFormValues, gameFormFields, type GameFormValues } from '../../../../src/features/games/game-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

/** Schedule a game for the active team (the web's /games/new). Coaches only. */
export default function NewGameScreen() {
  const { activeTeam } = useRole();
  const { triggerSync } = useSyncContext();
  const teamId = activeTeam?.teamId ?? '';
  const [initialValues] = useState(() => emptyGameFormValues());

  const options = useQuery({
    queryKey: gameFormOptionsQueryKey(teamId),
    queryFn: () => fetchGameFormOptions(teamId),
    enabled: Boolean(activeTeam?.isCoach),
  });

  const create = useMutation({
    mutationFn: (values: GameFormValues) =>
      createGame({ teamId, notifyTeam: values.notifyTeam, ...gameFormFields(values) }),
    onSuccess: ({ gameId }) => {
      // The Games list reads the offline mirror; pull the new game now.
      void triggerSync();
      router.replace({ pathname: '/(tabs)/schedule/games/[gameId]', params: { gameId } });
    },
  });

  const header = <Stack.Screen options={{ title: 'Schedule a game' }} />;

  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message={`Only coaches can schedule games${activeTeam ? ` for ${activeTeam.teamName}` : ''}.`} />
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
