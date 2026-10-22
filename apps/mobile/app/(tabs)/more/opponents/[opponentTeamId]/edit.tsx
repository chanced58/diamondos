import { ActivityIndicator, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '@baseball/ui';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { OpponentTeamForm } from '../../../../../src/features/opponents/OpponentTeamForm';
import {
  opponentTeamQueryKey,
  opponentTeamsQueryKey,
  updateOpponentTeam,
  useOpponentTeam,
  type OpponentTeamFields,
} from '../../../../../src/features/opponents/opponent-teams-api';
import { describeApiError } from '../../../../../src/lib/api-client';

/** Rename an opponent team or change its details. */
export default function EditOpponentTeamScreen() {
  const { opponentTeamId = '' } = useLocalSearchParams<{ opponentTeamId: string }>();
  const { activeTeam } = useRole();
  const query = useOpponentTeam(opponentTeamId);
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (fields: OpponentTeamFields) => updateOpponentTeam(opponentTeamId, fields),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: opponentTeamQueryKey(opponentTeamId) });
      if (activeTeam) void queryClient.invalidateQueries({ queryKey: opponentTeamsQueryKey(activeTeam.teamId) });
      router.back();
    },
  });

  const header = <Stack.Screen options={{ title: 'Edit opponent' }} />;
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

  return (
    <>
      {header}
      <OpponentTeamForm
        initial={query.data.team}
        submitLabel="Save team"
        saving={update.isPending}
        error={update.error ? describeApiError(update.error) : null}
        onSubmit={(fields) => update.mutate(fields)}
      />
    </>
  );
}
