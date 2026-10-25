import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@baseball/ui';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { DrillForm } from '../../../../../src/features/practices/DrillForm';
import { createDrill, drillsQueryKey } from '../../../../../src/features/practices/drills-api';
import { drillFields, emptyDrillFormValues, type DrillFormValues } from '../../../../../src/features/practices/drill-form-model';
import { describeApiError } from '../../../../../src/lib/api-client';

/** Add a drill to the team's library (the web New drill page). Coaches only. */
export default function NewDrillScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (values: DrillFormValues) => createDrill(teamId, drillFields(values)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: drillsQueryKey(teamId) }),
  });

  // Navigate after the render that drops the form's discard guard.
  const createdId = create.data?.drillId;
  useEffect(() => {
    if (createdId) router.replace({ pathname: '/(tabs)/more/practices/drills/[drillId]', params: { drillId: createdId } });
  }, [createdId]);

  const header = <Stack.Screen options={{ title: 'New drill' }} />;
  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can add drills." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <DrillForm
        initialValues={emptyDrillFormValues()}
        submitLabel="Add drill"
        saving={create.isPending}
        saveError={create.isError ? describeApiError(create.error) : null}
        saved={Boolean(createdId)}
        onSubmit={(values) => create.mutate(values)}
      />
    </View>
  );
}
