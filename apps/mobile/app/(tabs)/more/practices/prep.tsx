import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField, SegmentedControl } from '@baseball/ui';
import { formatInTimeZone } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { DateTimeFields } from '../../../../src/features/forms/DateTimeFields';
import { localDateFromParts } from '../../../../src/features/forms/date-parts';
import { createPrepPractice, usePrepPreview } from '../../../../src/features/practices/planning-api';
import { practicesQueryKey } from '../../../../src/features/practices/practices-api';
import { PlanBlocksList } from '../../../../src/features/practices/PlanBlocksList';
import { defaultPrepStart } from '../../../../src/features/practices/planning-model';
import { describeApiError } from '../../../../src/lib/api-client';

const DURATIONS = [
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
  { value: '120', label: '120 min' },
] as const;

/**
 * Prep for next game (the web /practices/prep/new): a practice aimed at the
 * next game, from the weaknesses in the last game and the opponent's
 * tendencies. The coach picks a length and a time, then saves it. Coaches only.
 */
export default function PrepPracticeScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const queryClient = useQueryClient();
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]['value']>('90');
  const query = usePrepPreview(activeTeam?.isCoach ? teamId : undefined, Number(duration));
  const [start, setStart] = useState<{ date: string; time: string } | null>(null);

  const nextGame = query.data?.nextGame ?? null;
  // Default the start once the game is known; the coach can change it.
  useEffect(() => {
    if (nextGame && !start) setStart(defaultPrepStart(nextGame.scheduledAt));
  }, [nextGame, start]);

  const save = useMutation({
    mutationFn: () =>
      createPrepPractice(teamId, {
        linkedGameId: nextGame!.id,
        scheduledAt: localDateFromParts(start!.date, start!.time).toISOString(),
        durationMinutes: query.data!.durationMinutes,
        prepFocusSummary: query.data!.focusSummary,
        blocks: query.data!.blocks,
      }),
    onSuccess: ({ practiceId }) => {
      void queryClient.invalidateQueries({ queryKey: practicesQueryKey(teamId) });
      router.replace({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId } });
    },
  });

  const header = <Stack.Screen options={{ title: 'Prep for next game' }} />;
  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can generate prep practices." />
      </View>
    );
  }
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
  if (!nextGame) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No upcoming game" message="Schedule a game first, then come back to build a prep practice for it." />
      </View>
    );
  }

  const preview = query.data;
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {header}
      <Text className="text-base text-gray-900 mb-3">
        vs <Text className="font-semibold">{nextGame.opponentName}</Text> ·{' '}
        {formatInTimeZone(nextGame.scheduledAt, nextGame.timeZone ?? undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </Text>
      <View className="mb-4">
        <SegmentedControl options={[...DURATIONS]} value={duration} onChange={setDuration} testID="prep-duration" />
      </View>

      <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
        <Text className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-1">Focus</Text>
        <Text className="text-sm text-amber-900">{preview.focusSummary}</Text>
        {preview.hasGaps && (
          <Text className="text-xs text-amber-800 mt-2">
            Some target weaknesses have no matching drill in your library — tag drills with those deficits on the web to improve future plans.
          </Text>
        )}
      </View>
      {(preview.weaknessLabels.length > 0 || preview.tendencyLabels.length > 0) && (
        <View className="mb-3">
          {preview.weaknessLabels.length > 0 && (
            <Text className="text-xs text-gray-600 mb-1">Last game: {preview.weaknessLabels.join(' · ')}</Text>
          )}
          {preview.tendencyLabels.length > 0 && (
            <Text className="text-xs text-gray-600">Opponent: {preview.tendencyLabels.join(' · ')}</Text>
          )}
        </View>
      )}
      <PlanBlocksList blocks={preview.blocks} drillsById={preview.drillsById} />

      {start && (
        <FormField label="When" required>
          <DateTimeFields date={start.date} time={start.time} onChange={setStart} testID="prep-practice-start" />
        </FormField>
      )}
      {save.isError && (
        <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">{describeApiError(save.error)}</Text>
      )}
      <Button
        label="Save prep practice"
        size="lg"
        loading={save.isPending}
        disabled={save.isPending || !start || preview.blocks.length === 0}
        onPress={() => save.mutate()}
      />
    </ScrollView>
  );
}
