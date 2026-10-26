import { useEffect } from 'react';
import { Alert, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { EmptyState } from '@baseball/ui';
import type { RosterPlayerFields } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { useSyncContext } from '../../../../src/providers/SyncProvider';
import { PlayerForm } from '../../../../src/features/roster/PlayerForm';
import { createRosterPlayer } from '../../../../src/features/roster/roster-api';
import { emptyPlayerForm } from '../../../../src/features/roster/player-form-model';
import { describeApiError } from '../../../../src/lib/api-client';

/** Add a player to the active team's roster (the web Add Player page). Coaches only. */
export default function NewPlayerScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const { triggerSync } = useSyncContext();

  const create = useMutation({
    mutationFn: (fields: RosterPlayerFields) => createRosterPlayer(teamId, fields),
    onSuccess: (result, fields) => {
      // The roster list is the offline mirror: pull the new player into it.
      void triggerSync();
      if (fields.email && !result.invited) {
        Alert.alert('Player added', `We couldn't email an invite to ${fields.email}. You can invite them again from the web roster.`);
      }
    },
  });

  // Navigate after the render that drops the form's discard guard.
  const createdId = create.data?.playerId;
  useEffect(() => {
    if (createdId) router.replace({ pathname: '/(tabs)/more/roster/[playerId]', params: { playerId: createdId } });
  }, [createdId]);

  const header = <Stack.Screen options={{ title: 'Add player' }} />;
  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can add players." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <PlayerForm
        initialValues={emptyPlayerForm}
        submitLabel="Add player"
        saving={create.isPending}
        saveError={create.isError ? describeApiError(create.error) : null}
        emailHint="With an email, the player is invited to join the team."
        saved={Boolean(createdId)}
        onSubmit={(fields) => create.mutate(fields)}
      />
    </View>
  );
}
