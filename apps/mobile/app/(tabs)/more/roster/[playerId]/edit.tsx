import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@baseball/ui';
import type { RosterPlayerFields } from '@baseball/shared';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { useSyncContext } from '../../../../../src/providers/SyncProvider';
import { PlayerForm } from '../../../../../src/features/roster/PlayerForm';
import { rosterPlayerQueryKey, updateRosterPlayer, useRosterPlayer } from '../../../../../src/features/roster/roster-api';
import { formFromPlayer } from '../../../../../src/features/roster/player-form-model';
import { describeApiError } from '../../../../../src/lib/api-client';

/** Edit an active player's details (the web player page's form). Roster managers only. */
export default function EditPlayerScreen() {
  const { playerId = '' } = useLocalSearchParams<{ playerId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const query = useRosterPlayer(teamId, playerId);
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();

  const update = useMutation({
    mutationFn: (fields: RosterPlayerFields) => updateRosterPlayer(teamId as string, playerId, fields),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rosterPlayerQueryKey(teamId ?? '', playerId) });
      void triggerSync();
    },
  });

  // Go back after the render that drops the form's discard guard.
  const saved = update.isSuccess;
  useEffect(() => {
    if (saved) router.back();
  }, [saved]);

  const header = <Stack.Screen options={{ title: 'Edit player' }} />;
  if (query.isPending && teamId) {
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
        {teamId ? (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState title="No team" message="Join a team to see its roster." />
        )}
      </View>
    );
  }
  if (!query.data.canManage || !query.data.player.isActive) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState
          title={query.data.canManage ? 'Player is disabled' : 'Coaches only'}
          message={query.data.canManage ? 'Reactivate the player before editing them.' : 'Only coaches can edit players.'}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <PlayerForm
        initialValues={formFromPlayer(query.data.player)}
        submitLabel="Save changes"
        saving={update.isPending}
        saveError={update.isError ? describeApiError(update.error) : null}
        saved={saved}
        onSubmit={(fields) => update.mutate(fields)}
      />
    </View>
  );
}
