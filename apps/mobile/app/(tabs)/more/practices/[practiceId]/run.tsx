import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState } from '@baseball/ui';
import {
  BLOCK_TYPE_LABELS,
  formatCountdown,
  formatTime,
  type PracticeBlockType,
  type PracticeRunResponse,
} from '@baseball/shared';
import {
  practiceQueryKey,
  practiceRunQueryKey,
  runPracticeAction,
  usePracticeRun,
} from '../../../../../src/features/practices/practices-api';
import {
  actualMinutes,
  allBlocksDone,
  blockTimer,
  currentBlock,
  nextPendingAfter,
  timerTone,
} from '../../../../../src/features/practices/runner-model';
import { describeApiError } from '../../../../../src/lib/api-client';
import { openOnWeb, webUrl } from '../../../../../src/lib/web-links';

const TONE_CLASS = { good: 'text-emerald-600', warn: 'text-amber-500', over: 'text-red-600' } as const;

type RunAction = Parameters<typeof runPracticeAction>[1];

/**
 * The practice runner (the web Practice runner): a big countdown for the
 * block on the field, then complete (which starts the next block), skip, or
 * end practice. The timer is derived from the block's start time, so it
 * survives the phone sleeping. Head coaches and athletic directors start and
 * end the practice; an assistant controls the blocks assigned to them.
 */
export default function PracticeRunScreen() {
  const { practiceId = '' } = useLocalSearchParams<{ practiceId: string }>();
  const queryClient = useQueryClient();
  const query = usePracticeRun(practiceId);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const act = useMutation({
    mutationFn: async (actions: RunAction[]) => {
      let state: PracticeRunResponse | null = null;
      for (const action of actions) state = await runPracticeAction(practiceId, action);
      return state;
    },
    onSuccess: (state) => {
      if (state) queryClient.setQueryData(practiceRunQueryKey(practiceId), state);
      void queryClient.invalidateQueries({ queryKey: practiceQueryKey(practiceId) });
    },
    onError: (error) => {
      Alert.alert('Could not update the practice', describeApiError(error));
      void query.refetch();
    },
  });

  const header = <Stack.Screen options={{ title: 'Run practice' }} />;

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

  const { practice, blocks, canRunPractice } = query.data;
  const editOnWeb = webUrl('/') ? () => void openOnWeb(`/practices/${practiceId}/plan`) : null;

  if (practice.runStatus === 'completed') {
    return (
      <Centered header={header}>
        <Text className="text-2xl font-bold text-gray-900 mb-1">Practice complete ✓</Text>
        <Text className="text-gray-500">Ended at {practice.completedAt ? formatTime(practice.completedAt) : '—'}</Text>
      </Centered>
    );
  }

  if (practice.runStatus === 'not_started') {
    const totalMinutes = blocks.reduce((sum, b) => sum + b.plannedDurationMinutes, 0);
    return (
      <Centered header={header}>
        <Text className="text-xl font-bold text-gray-900 mb-1">Ready to run</Text>
        <Text className="text-gray-500 mb-6">
          {blocks.length} block{blocks.length === 1 ? '' : 's'} · {totalMinutes} min total
        </Text>
        {blocks.length === 0 ? (
          <>
            <Text className="text-sm text-red-600 mb-3 text-center">Add at least one block to the practice plan first.</Text>
            {editOnWeb && <Button label="Build the plan on the web" variant="secondary" onPress={editOnWeb} />}
          </>
        ) : canRunPractice ? (
          <Button label="▶ Start practice" size="lg" loading={act.isPending} disabled={act.isPending} onPress={() => act.mutate([{ action: 'start' }])} />
        ) : (
          <Text className="text-sm text-gray-500 text-center">A head coach or athletic director starts the practice.</Text>
        )}
      </Centered>
    );
  }

  const block = currentBlock(blocks);
  const active = block?.status === 'active';
  const timer = block ? blockTimer(block, now) : null;
  const done = allBlocksDone(blocks);

  const completeBlock = () => {
    if (!block) return;
    const next = nextPendingAfter(blocks, block.position);
    const actions: RunAction[] = [{ action: 'completeBlock', blockId: block.id, actualDurationMinutes: actualMinutes(block, now) }];
    if (next?.canControl) actions.push({ action: 'startBlock', blockId: next.id });
    act.mutate(actions);
  };
  const endPractice = () =>
    Alert.alert(done ? 'End practice?' : 'End practice early?', undefined, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End practice', style: 'destructive', onPress: () => act.mutate([{ action: 'complete' }]) },
    ]);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      {block ? (
        <View className="bg-white rounded-2xl border border-gray-200 p-5">
          <Text className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            {BLOCK_TYPE_LABELS[block.blockType as PracticeBlockType] ?? block.blockType}
            {active ? ' · Active' : ' · Up next'}
          </Text>
          <Text className="text-2xl font-bold text-gray-900 mb-2">{block.title}</Text>
          {timer && (
            <View className="items-center py-3">
              <Text accessibilityLabel="Time remaining" className={`text-6xl font-bold ${TONE_CLASS[timerTone(timer)]}`} style={{ fontVariant: ['tabular-nums'] }}>
                {timer.overrunSeconds > 0 ? `+${formatCountdown(timer.overrunSeconds)}` : formatCountdown(timer.remainingSeconds)}
              </Text>
              <Text className="text-sm text-gray-500 mt-1">
                {timer.overrunSeconds > 0 ? `Over · planned ${block.plannedDurationMinutes} min` : `of ${block.plannedDurationMinutes} min`}
              </Text>
            </View>
          )}
          {block.notes && <Text className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 mt-2">{block.notes}</Text>}
          <View className="mt-4 gap-2">
            {!block.canControl ? (
              <Text className="text-sm text-gray-500 text-center">This block is run by its assigned coach.</Text>
            ) : !active ? (
              <Button label="Start this block" size="lg" loading={act.isPending} disabled={act.isPending} onPress={() => act.mutate([{ action: 'startBlock', blockId: block.id }])} />
            ) : (
              <>
                <Button label="✓ Complete block" size="lg" loading={act.isPending} disabled={act.isPending} onPress={completeBlock} />
                <Button label="Skip" variant="secondary" disabled={act.isPending} onPress={() => act.mutate([{ action: 'skipBlock', blockId: block.id }])} />
              </>
            )}
          </View>
        </View>
      ) : (
        <View className="bg-white rounded-2xl border border-gray-200 p-6 items-center">
          <Text className="text-gray-500">All blocks completed.</Text>
        </View>
      )}

      {canRunPractice && (
        <View className="mt-4">
          <Button label={done ? 'End practice' : 'End practice early'} variant="ghost" disabled={act.isPending} onPress={endPractice} />
        </View>
      )}

      <Text className="text-xs uppercase tracking-wide font-semibold text-gray-500 mt-6 mb-2">Practice plan</Text>
      <View className="bg-white rounded-xl border border-gray-200 p-2">
        {blocks.map((b) => {
          const isCurrent = block?.id === b.id;
          const mark = b.status === 'completed' ? '✓ ' : b.status === 'skipped' ? '⤼ ' : '';
          return (
            <View key={b.id} className={`flex-row justify-between px-2 py-1.5 rounded-lg ${isCurrent ? 'bg-brand-50' : ''}`}>
              <Text
                className={`text-sm flex-1 ${isCurrent ? 'font-semibold text-gray-900' : b.status === 'pending' || b.status === 'active' ? 'text-gray-700' : 'text-gray-400'}`}
              >
                {mark}
                {b.title}
              </Text>
              <Text className="text-xs text-gray-400 ml-2">{b.actualDurationMinutes ?? b.plannedDurationMinutes}m</Text>
            </View>
          );
        })}
      </View>
      {editOnWeb && (
        <View className="mt-3">
          <Button label="Edit blocks on the web" variant="ghost" onPress={editOnWeb} />
        </View>
      )}
    </ScrollView>
  );
}

/** One centered card, for the runner's ready and finished states. */
function Centered({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-gray-50 p-4">
      {header}
      <View className="bg-white rounded-2xl border border-gray-200 p-6 items-center">{children}</View>
    </View>
  );
}
