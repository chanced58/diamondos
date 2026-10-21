import { ActivityIndicator, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@baseball/ui';
import { useSyncContext } from '../../../../../src/providers/SyncProvider';
import { useGameDetail } from '../../../../../src/features/games/use-game-detail';
import { gameDetailQueryKey } from '../../../../../src/features/games/game-detail-api';
import { GameForm } from '../../../../../src/features/games/GameForm';
import { fetchGameFormOptions, gameFormOptionsQueryKey, updateGame } from '../../../../../src/features/games/game-form-api';
import { gameFormFields, gameFormValuesFromGame, type GameFormValues } from '../../../../../src/features/games/game-form-model';
import { describeApiError } from '../../../../../src/lib/api-client';

/** Edit a game's opponent, time, location and venue (the web's EditGameForm). Coaches only. */
export default function EditGameScreen() {
  const { gameId = '' } = useLocalSearchParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();
  const detail = useGameDetail(gameId);
  const teamId = detail.data?.game.teamId ?? '';

  const options = useQuery({
    queryKey: gameFormOptionsQueryKey(teamId),
    queryFn: () => fetchGameFormOptions(teamId),
    enabled: Boolean(detail.data?.viewer.isCoach),
  });

  const save = useMutation({
    mutationFn: (values: GameFormValues) => updateGame(gameId, gameFormFields(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: gameDetailQueryKey(gameId) });
      void triggerSync();
      router.back();
    },
  });

  const header = <Stack.Screen options={{ title: 'Edit game' }} />;

  if (detail.isPending || (detail.data?.viewer.isCoach && options.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  const loadError = detail.error ?? options.error;
  if (loadError || !detail.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState
          message={describeApiError(loadError)}
          onRetry={() => void (detail.error ? detail.refetch() : options.refetch())}
        />
      </View>
    );
  }
  if (!detail.data.viewer.isCoach || !options.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can edit games." />
      </View>
    );
  }

  const { game } = detail.data;
  return (
    <>
      {header}
      <GameForm
        mode="edit"
        initialValues={gameFormValuesFromGame(game)}
        opponentTeams={options.data.opponentTeams}
        allowTbd={game.status !== 'in_progress' && game.status !== 'completed'}
        submitting={save.isPending}
        submitError={save.isError ? describeApiError(save.error) : null}
        onSubmit={(values) => save.mutate(values)}
      />
    </>
  );
}
