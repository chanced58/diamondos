import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, SectionHeader } from '@baseball/ui';
import { LINEUP_POSITIONS, POSITION_TO_DB, type OpponentRosterPlayer } from '@baseball/shared';
import { useSyncContext } from '../../../../../src/providers/SyncProvider';
import { useDiscardGuard } from '../../../../../src/features/forms/use-discard-guard';
import {
  addOpponentPlayer,
  autoFillOpponentLineup,
  opponentLineupQueryKey,
  removeOpponentPlayer,
  saveOpponentLineup,
  saveOpponentTeam,
  updateOpponentPlayer,
  useOpponentLineup,
  type OpponentPlayerFields,
} from '../../../../../src/features/opponents/opponent-lineup-api';
import {
  assignSlot,
  assignmentsChanged,
  assignmentsFrom,
  lineupEntries,
  opponentPlayerLabel,
  positionLabel,
  rebaseAssignments,
  slotOptions,
  sortForOrder,
  type OpponentAssignments,
} from '../../../../../src/features/opponents/opponent-lineup-model';
import { OpponentPlayerSheet } from '../../../../../src/features/opponents/OpponentPlayerSheet';
import { OptionSheet, type SheetOption } from '../../../../../src/features/opponents/OptionSheet';
import { describeApiError } from '../../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

type Picker = { playerId: string; field: 'order' | 'position' } | null;
type PlayerSheet = { player: OpponentRosterPlayer | null } | null;

/**
 * The opponent's team record, roster and batting order for a game (the web's
 * /games/[gameId]/opponent-lineup). Coaches only. Writes go to the server,
 * then a sync brings them into the offline scorer.
 */
export default function OpponentLineupScreen() {
  const { gameId = '' } = useLocalSearchParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();
  const query = useOpponentLineup(gameId);

  const [order, setOrder] = useState<{ baseline: OpponentAssignments; draft: OpponentAssignments } | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [playerSheet, setPlayerSheet] = useState<PlayerSheet>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    const next = assignmentsFrom(query.data);
    setOrder((prev) =>
      prev ? { baseline: next, draft: rebaseAssignments(prev.baseline, prev.draft, next) } : { baseline: next, draft: next },
    );
  }, [query.data]);

  const dirty = order !== null && assignmentsChanged(order.baseline, order.draft);
  useDiscardGuard(dirty, 'Your batting order has not been saved.');

  const afterWrite = async () => {
    await queryClient.invalidateQueries({ queryKey: opponentLineupQueryKey(gameId) });
    void triggerSync();
  };
  const alertError = (title: string) => (error: unknown) => Alert.alert(title, describeApiError(error));

  const saveTeam = useMutation({
    mutationFn: (name: string) => saveOpponentTeam(gameId, name),
    onSuccess: async () => {
      setTeamName(null);
      await afterWrite();
    },
    onError: alertError('Could not save the team'),
  });
  const savePlayer = useMutation({
    mutationFn: ({ playerId, fields }: { playerId: string | null; fields: OpponentPlayerFields }) =>
      playerId ? updateOpponentPlayer(gameId, playerId, fields) : addOpponentPlayer(gameId, fields),
    onSuccess: async () => {
      setPlayerSheet(null);
      await afterWrite();
    },
  });
  const removePlayer = useMutation({
    mutationFn: (playerId: string) => removeOpponentPlayer(gameId, playerId),
    onSuccess: afterWrite,
    onError: alertError('Could not remove the player'),
  });
  const autoFill = useMutation({
    mutationFn: () => autoFillOpponentLineup(gameId),
    onSuccess: afterWrite,
    onError: alertError('Could not fill the order'),
  });
  const saveOrder = useMutation({
    mutationFn: (draft: OpponentAssignments) => saveOpponentLineup(gameId, lineupEntries(draft)),
    onSuccess: async () => {
      setOrderNotice('Batting order saved.');
      await afterWrite();
    },
  });

  const header = <Stack.Screen options={{ title: 'Opponent lineup' }} />;

  // The draft is set from the data in an effect, one render after it arrives.
  if (query.isPending || (query.data && !order)) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data || !order) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const data = query.data;
  const players = sortForOrder(data.players, order.draft);
  const slots = slotOptions(data.players.length, data.maxBatters);
  const pickerPlayer = picker ? data.players.find((p) => p.id === picker.playerId) : undefined;

  const setDraft = (draft: OpponentAssignments) => {
    setOrderNotice(null);
    setOrder({ baseline: order.baseline, draft });
  };

  const confirmRemove = (player: OpponentRosterPlayer) =>
    Alert.alert('Remove player?', `${opponentPlayerLabel(player)} leaves the roster. Recorded stats are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePlayer.mutate(player.id) },
    ]);

  const pickerOptions: SheetOption[] = !picker
    ? []
    : picker.field === 'order'
      ? [
          { key: 'bench', label: 'Bench', onPress: () => { setDraft(assignSlot(order.draft, picker.playerId, null)); setPicker(null); } },
          ...slots.map((slot) => {
            const holder = data.players.find((p) => p.id !== picker.playerId && order.draft[p.id]?.order === slot);
            return {
              key: String(slot),
              label: holder ? `${slot}  (${holder.lastName})` : String(slot),
              onPress: () => { setDraft(assignSlot(order.draft, picker.playerId, slot)); setPicker(null); },
            };
          }),
        ]
      : [null, ...LINEUP_POSITIONS.map((abbr) => POSITION_TO_DB[abbr])].map((position) => ({
          key: position ?? 'none',
          label: positionLabel(position) ?? '— (no position)',
          onPress: () => {
            setDraft({ ...order.draft, [picker.playerId]: { ...order.draft[picker.playerId], position } });
            setPicker(null);
          },
        }));

  const editingTeam = teamName !== null;
  const hasTeam = data.opponentTeam !== null;

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <SectionHeader title="Opponent team" />
        <View className="bg-white rounded-xl border border-gray-200 p-4">
          {hasTeam && !editingTeam ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-gray-900 flex-1" numberOfLines={1}>{data.opponentTeam?.name}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setTeamName(data.opponentTeam?.name ?? '')} hitSlop={8}>
                <Text className="text-sm font-semibold text-blue-700">Rename</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {!hasTeam && (
                <Text className="text-sm text-gray-500 mb-2">
                  Create a team record to keep the opponent's roster and batting order.
                </Text>
              )}
              <TextInput
                accessibilityLabel="Opponent team name"
                className={inputClass}
                value={teamName ?? data.opponentName ?? ''}
                onChangeText={setTeamName}
                placeholder="e.g. Lincoln Eagles"
                placeholderTextColor="#9ca3af"
              />
              <View className="flex-row justify-end gap-2 mt-3">
                {hasTeam && <Button label="Cancel" variant="secondary" onPress={() => setTeamName(null)} />}
                <Button
                  label={hasTeam ? 'Save name' : 'Create team'}
                  loading={saveTeam.isPending}
                  disabled={!(teamName ?? data.opponentName ?? '').trim()}
                  onPress={() => saveTeam.mutate((teamName ?? data.opponentName ?? '').trim())}
                />
              </View>
            </>
          )}
        </View>

        {hasTeam && (
          <>
            <SectionHeader
              title={`Roster (${data.players.length})`}
              action={{ label: 'Add player', onPress: () => { savePlayer.reset(); setPlayerSheet({ player: null }); } }}
            />
            <View className="bg-white rounded-xl border border-gray-200">
              {data.players.length === 0 ? (
                <Text className="text-sm text-gray-500 p-4">No players yet. Add the opponent's roster to set its order.</Text>
              ) : (
                data.players.map((player, index) => (
                  <View
                    key={player.id}
                    className={`flex-row items-center px-4 py-3 ${index > 0 ? 'border-t border-gray-100' : ''}`}
                  >
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-medium text-gray-900">{opponentPlayerLabel(player)}</Text>
                      {player.primaryPosition && (
                        <Text className="text-xs text-gray-400">{positionLabel(player.primaryPosition)}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${opponentPlayerLabel(player)}`}
                      onPress={() => { savePlayer.reset(); setPlayerSheet({ player }); }}
                      className="px-3 py-1.5 mr-2"
                    >
                      <Text className="text-sm font-semibold text-blue-700">Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${opponentPlayerLabel(player)}`}
                      onPress={() => confirmRemove(player)}
                      className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200"
                    >
                      <Text className="text-xs font-semibold text-red-700">Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            {data.players.length > 0 && (
              <>
                <SectionHeader
                  title="Batting order"
                  action={
                    data.lineup.length === 0 && !dirty
                      ? { label: autoFill.isPending ? 'Filling…' : 'Auto-fill from roster', onPress: () => autoFill.mutate() }
                      : undefined
                  }
                />
                <View className="bg-white rounded-xl border border-gray-200 px-4">
                  {players.map((player, index) => {
                    const assignment = order.draft[player.id] ?? { order: null, position: null };
                    const position = positionLabel(assignment.position);
                    return (
                      <View
                        key={player.id}
                        className={`flex-row items-center py-2.5 ${index > 0 ? 'border-t border-gray-100' : ''}`}
                      >
                        <Text className="flex-1 pr-2 text-sm font-medium text-gray-900" numberOfLines={1}>
                          {opponentPlayerLabel(player)}
                        </Text>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Batting slot for ${opponentPlayerLabel(player)}`}
                          onPress={() => setPicker({ playerId: player.id, field: 'order' })}
                          className={`w-16 mr-2 rounded-lg border px-2 py-1.5 items-center ${
                            assignment.order !== null ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <Text className={`text-sm font-semibold ${assignment.order !== null ? 'text-emerald-800' : 'text-gray-500'}`}>
                            {assignment.order !== null ? String(assignment.order) : 'Bench'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Position for ${opponentPlayerLabel(player)}`}
                          onPress={() => setPicker({ playerId: player.id, field: 'position' })}
                          className={`w-16 rounded-lg border px-2 py-1.5 items-center ${
                            position ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <Text className={`text-sm font-semibold ${position ? 'text-blue-800' : 'text-gray-500'}`}>
                            {position ?? '—'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                <Text className="text-xs text-gray-500 mt-2 px-1">
                  Bench players are left out of the order, except a benched P — saved as the starting pitcher who
                  doesn't bat (DH rules).
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>

      {hasTeam && data.players.length > 0 && (
        <View className="border-t border-gray-200 bg-white px-4 pt-3 pb-6">
          {saveOrder.isError && (
            <Text accessibilityRole="alert" className="text-sm text-red-700 mb-2">{describeApiError(saveOrder.error)}</Text>
          )}
          {orderNotice && !dirty && <Text className="text-sm text-green-700 mb-2">{orderNotice}</Text>}
          <Button
            label="Save batting order"
            size="lg"
            loading={saveOrder.isPending}
            disabled={!dirty}
            onPress={() => saveOrder.mutate(order.draft)}
          />
        </View>
      )}

      <OptionSheet
        title={picker ? `${picker.field === 'order' ? 'Batting slot' : 'Position'}${pickerPlayer ? ` — ${pickerPlayer.lastName}` : ''}` : null}
        options={pickerOptions}
        onClose={() => setPicker(null)}
      />
      <OpponentPlayerSheet
        visible={playerSheet !== null}
        player={playerSheet?.player ?? null}
        saving={savePlayer.isPending}
        error={savePlayer.isError ? describeApiError(savePlayer.error) : null}
        onSave={(fields) => savePlayer.mutate({ playerId: playerSheet?.player?.id ?? null, fields })}
        onClose={() => setPlayerSheet(null)}
      />
    </View>
  );
}
