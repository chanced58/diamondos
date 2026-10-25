import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorState, SectionHeader } from '@baseball/ui';
import { EQUIPMENT_LABELS, FIELD_SPACE_LABELS, SKILL_CATEGORY_LABELS, type DrillDetailResponse } from '@baseball/shared';
import { useRole } from '../../../../../../src/providers/RoleProvider';
import { deleteDrill, drillsQueryKey, useDrill } from '../../../../../../src/features/practices/drills-api';
import { drillPlayers, isTeamDrill } from '../../../../../../src/features/practices/drill-format';
import { describeApiError } from '../../../../../../src/lib/api-client';

/**
 * One drill (the web drill page): what it works on, its setup and coaching
 * points, and the deficits it fixes for the team. A coach edits or deletes
 * the team's own drills; curated drills are read-only.
 */
export default function DrillDetailScreen() {
  const { drillId } = useLocalSearchParams<{ drillId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId;
  const query = useDrill(teamId, drillId ?? '');
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => deleteDrill(drillId ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: drillsQueryKey(teamId ?? '') });
      router.back();
    },
    onError: (error) => Alert.alert('Couldn’t delete the drill', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: query.data?.drill.name ?? 'Drill' }} />;
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
          <EmptyState title="No team" message="Join a team to see its drill library." />
        )}
      </View>
    );
  }

  const confirmDelete = () =>
    Alert.alert(`Delete ${query.data.drill.name}?`, 'Practices that use it keep their blocks.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <DrillBody detail={query.data} />
      {query.data.canEdit && (
        <View className="gap-2 mt-4">
          <Button
            label="Edit drill"
            variant="secondary"
            onPress={() => router.push({ pathname: '/(tabs)/more/practices/drills/[drillId]/edit', params: { drillId: query.data.drill.id } })}
          />
          <Button label="Delete drill" variant="danger" loading={remove.isPending} onPress={confirmDelete} />
        </View>
      )}
    </ScrollView>
  );
}

/** The drill's facts, in the web drill page's order. */
function DrillBody({ detail }: { detail: DrillDetailResponse }) {
  const { drill, fixes } = detail;
  const players = drillPlayers(drill);
  const facts = [drill.defaultDurationMinutes ? `${drill.defaultDurationMinutes} min` : null, players].filter(Boolean).join(' · ');

  return (
    <View>
      <View className="flex-row flex-wrap items-center gap-2 mb-2">
        <Badge label={isTeamDrill(drill) ? 'Team drill' : 'Curated'} variant="default" />
        {drill.skillCategories.map((category) => (
          <Badge key={category} label={SKILL_CATEGORY_LABELS[category]} variant="safe" />
        ))}
      </View>
      {facts.length > 0 && <Text className="text-sm text-gray-600 mb-3">{facts}</Text>}
      {drill.description && <Text className="text-base text-gray-900 mb-2">{drill.description}</Text>}

      {drill.coachingPoints && (
        <>
          <SectionHeader title="Coaching points" />
          <Text className="text-base text-gray-900">{drill.coachingPoints}</Text>
        </>
      )}

      {(drill.fieldSpaces.length > 0 || drill.equipment.length > 0) && (
        <>
          <SectionHeader title="Setup" />
          {drill.fieldSpaces.length > 0 && (
            <Text className="text-sm text-gray-700 mb-1">Space: {drill.fieldSpaces.map((s) => FIELD_SPACE_LABELS[s]).join(', ')}</Text>
          )}
          {drill.equipment.length > 0 && (
            <Text className="text-sm text-gray-700">Equipment: {drill.equipment.map((e) => EQUIPMENT_LABELS[e]).join(', ')}</Text>
          )}
        </>
      )}

      {(fixes.primary.length > 0 || fixes.secondary.length > 0) && (
        <>
          <SectionHeader title="Fixes" />
          {fixes.primary.length > 0 && <Text className="text-sm text-gray-700 mb-1">Primary: {fixes.primary.map((f) => f.name).join(', ')}</Text>}
          {fixes.secondary.length > 0 && <Text className="text-sm text-gray-700">Also helps: {fixes.secondary.map((f) => f.name).join(', ')}</Text>}
        </>
      )}

      {drill.tags.length > 0 && (
        <>
          <SectionHeader title="Tags" />
          <Text className="text-sm text-gray-700">{drill.tags.join(', ')}</Text>
        </>
      )}

      {drill.videoUrl && isWebLink(drill.videoUrl) && (
        <View className="mt-4">
          <Button label="Watch the video" variant="ghost" onPress={() => openVideo(drill.videoUrl ?? '')} />
        </View>
      )}
    </View>
  );
}

/** Only web links open: a drill's link is coach-typed, and older drills predate the server's http(s) check. */
function isWebLink(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Opens the drill's video in the browser, saying so when the device can't. */
function openVideo(url: string) {
  Linking.openURL(url).catch(() => Alert.alert('Couldn’t open the video', 'Try the link on the web.'));
}
