import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@baseball/ui';
import { useRole } from '../../../../../../src/providers/RoleProvider';
import { DrillForm } from '../../../../../../src/features/practices/DrillForm';
import { drillsQueryKey, updateDrill, useDrill } from '../../../../../../src/features/practices/drills-api';
import { drillFields, drillFormValuesFrom, type DrillFormValues } from '../../../../../../src/features/practices/drill-form-model';
import { describeApiError } from '../../../../../../src/lib/api-client';

/** Edit one of the team's drills (the web Edit drill page). Coaches only; curated drills can't be edited. */
export default function EditDrillScreen() {
  const { drillId = '' } = useLocalSearchParams<{ drillId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const query = useDrill(teamId || undefined, drillId);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (values: DrillFormValues) => updateDrill(drillId, drillFields(values, query.data?.drill)),
    // The library and the drill page both read the drill: refresh them together.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: drillsQueryKey(teamId) }),
  });

  // Navigate after the render that drops the form's discard guard.
  const saved = save.isSuccess;
  useEffect(() => {
    if (saved) router.back();
  }, [saved]);

  const header = <Stack.Screen options={{ title: 'Edit drill' }} />;
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
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }
  if (!query.data.canEdit) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Can’t edit this drill" message="Coaches edit their team’s own drills; curated drills stay as they are." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <DrillForm
        initialValues={drillFormValuesFrom(query.data.drill)}
        submitLabel="Save drill"
        saving={save.isPending}
        saveError={save.isError ? describeApiError(save.error) : null}
        saved={saved}
        onSubmit={(values) => save.mutate(values)}
      />
    </View>
  );
}
