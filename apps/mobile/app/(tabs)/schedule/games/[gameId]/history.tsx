import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ErrorState } from '@baseball/ui';
import type { GameEvent } from '@baseball/shared';
import { useSyncContext } from '../../../../../src/providers/SyncProvider';
import { getDeviceId } from '../../../../../src/lib/device-id';
import { openOnWeb, webUrl } from '../../../../../src/lib/web-links';
import { describeApiError, isApiError } from '../../../../../src/lib/api-client';
import { gameDetailQueryKey, recalculateScores } from '../../../../../src/features/games/game-detail-api';
import { boxScoreQueryKey } from '../../../../../src/features/stats/box-score-api';
import { historyQueryKey, replaceEvent, useGameHistory, voidEvent } from '../../../../../src/features/history/history-api';
import { historyTree, type Replacement } from '../../../../../src/features/history/history-model';
import { HistoryTreeView } from '../../../../../src/features/history/HistoryTreeView';
import { CorrectionSheet } from '../../../../../src/features/history/CorrectionSheet';

type Correction = { kind: 'void' } | { kind: 'replace'; replacement: Replacement };

/**
 * A started game's play-by-play (the web's /games/[gameId]/history). Any team
 * member reads it; coaches tap an event to correct it.
 */
export default function GameHistoryScreen() {
  const { gameId = '' } = useLocalSearchParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();
  const query = useGameHistory(gameId);
  const [target, setTarget] = useState<{ event: GameEvent; label: string } | null>(null);

  const tree = useMemo(() => (query.data ? historyTree(query.data) : null), [query.data]);

  const refreshGame = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: historyQueryKey(gameId) }),
      queryClient.invalidateQueries({ queryKey: boxScoreQueryKey(gameId) }),
      queryClient.invalidateQueries({ queryKey: gameDetailQueryKey(gameId) }),
    ]);
    void triggerSync();
  };

  const correct = useMutation({
    mutationFn: async ({ event, correction }: { event: GameEvent; correction: Correction }) => {
      const deviceId = await getDeviceId();
      return correction.kind === 'void'
        ? voidEvent(gameId, event.id, deviceId)
        : replaceEvent(gameId, event.id, correction.replacement, deviceId);
    },
    onSuccess: async () => {
      setTarget(null);
      await refreshGame();
    },
  });

  const recalculate = useMutation({
    mutationFn: () => recalculateScores(gameId),
    onSuccess: refreshGame,
    onError: (error) => Alert.alert('Could not recalculate', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'Play-by-play' }} />;

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data || !tree) {
    const notStarted = isApiError(query.error) && query.error.kind === 'conflict';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={notStarted ? undefined : () => void query.refetch()} />
      </View>
    );
  }

  const history = query.data;
  const ourScore = (home: number, away: number) => {
    const [us, them] = history.weAreHome ? [home, away] : [away, home];
    return `${us} – ${them}`;
  };
  const webHistoryPath = `/games/${gameId}/history`;
  const canOpenWeb = webUrl(webHistoryPath) !== null;

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text accessibilityRole="header" className="text-lg font-bold text-gray-900 flex-1" numberOfLines={1}>
            {history.teamName} {ourScore(history.homeScore, history.awayScore)} {history.opponentName}
          </Text>
          <Badge label={history.status === 'completed' ? 'Final' : 'Live'} variant={history.status === 'completed' ? 'default' : 'safe'} />
        </View>

        {history.isCoach && (
          <View className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
            <Text className="text-sm text-blue-900">
              Tap a pitch or play to correct it. Corrections are added to the log; nothing is erased. Recalculate
              afterwards to update the final score.
            </Text>
            <View className="mt-3 flex-row">
              <Button
                label="Recalculate scores"
                variant="secondary"
                size="sm"
                loading={recalculate.isPending}
                onPress={() => recalculate.mutate()}
              />
            </View>
          </View>
        )}

        <HistoryTreeView
          tree={tree}
          ourScore={ourScore}
          onSelect={history.isCoach ? (event, label) => { correct.reset(); setTarget({ event, label }); } : undefined}
        />
      </ScrollView>

      <CorrectionSheet
        target={target}
        pending={correct.isPending}
        error={correct.isError ? describeApiError(correct.error) : null}
        onReplace={(event, replacement) => correct.mutate({ event, correction: { kind: 'replace', replacement } })}
        onDelete={(event) => correct.mutate({ event, correction: { kind: 'void' } })}
        onClose={() => setTarget(null)}
        onOpenWeb={canOpenWeb ? () => void openOnWeb(webHistoryPath) : undefined}
      />
    </View>
  );
}
