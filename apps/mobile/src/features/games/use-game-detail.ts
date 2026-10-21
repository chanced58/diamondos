import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncContext } from '../../providers/SyncProvider';
import { getDeviceId } from '../../lib/device-id';
import {
  cancelGame,
  fetchGameDetail,
  gameDetailQueryKey,
  recalculateScores,
  resetGame,
  setReconciliationOverride,
} from './game-detail-api';

export function useGameDetail(gameId: string) {
  return useQuery({
    queryKey: gameDetailQueryKey(gameId),
    queryFn: () => fetchGameDetail(gameId),
    enabled: gameId.length > 0,
  });
}

/**
 * The coach actions on a game. Each refetches the detail on success, and the
 * ones that change the `games` row (or append a reset event) also kick a sync
 * so the offline mirror behind the schedule and scorer catches up now rather
 * than on the next 30-second tick.
 */
export function useGameActions(gameId: string) {
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();

  const refresh = async (syncMirror: boolean) => {
    await queryClient.invalidateQueries({ queryKey: gameDetailQueryKey(gameId) });
    if (syncMirror) void triggerSync();
  };

  const cancel = useMutation({
    mutationFn: (notifyTeam: boolean) => cancelGame(gameId, notifyTeam),
    onSuccess: () => refresh(true),
  });

  const reset = useMutation({
    mutationFn: async () => resetGame(gameId, await getDeviceId()),
    onSuccess: () => refresh(true),
  });

  const recalculate = useMutation({
    mutationFn: () => recalculateScores(gameId),
    onSuccess: () => refresh(true),
  });

  const override = useMutation({
    mutationFn: (args: { reconciliationId: string; conflictKey: string; useAwayValue: boolean }) =>
      setReconciliationOverride(args.reconciliationId, args.conflictKey, args.useAwayValue),
    onSuccess: () => refresh(false),
  });

  return { cancel, reset, recalculate, override };
}
