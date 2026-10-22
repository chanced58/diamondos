import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRole } from '../../../../src/providers/RoleProvider';
import { OpponentTeamForm } from '../../../../src/features/opponents/OpponentTeamForm';
import {
  createOpponentTeam,
  opponentTeamsQueryKey,
  type OpponentTeamFields,
} from '../../../../src/features/opponents/opponent-teams-api';
import { describeApiError } from '../../../../src/lib/api-client';

/** A new opponent team for the active team; opens its roster once created. */
export default function NewOpponentTeamScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (fields: OpponentTeamFields) => createOpponentTeam(teamId, fields),
    onSuccess: ({ opponentTeamId }) => {
      void queryClient.invalidateQueries({ queryKey: opponentTeamsQueryKey(teamId) });
      router.replace({ pathname: '/(tabs)/more/opponents/[opponentTeamId]', params: { opponentTeamId } });
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: 'New opponent' }} />
      <OpponentTeamForm
        submitLabel="Create team"
        saving={create.isPending}
        error={create.error ? describeApiError(create.error) : null}
        onSubmit={(fields) => create.mutate(fields)}
      />
    </>
  );
}
