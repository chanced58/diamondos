import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { useSyncContext } from '../../../../../../../src/providers/SyncProvider';
import { ChoiceChips } from '../../../../../../../src/features/practices/ChoiceChips';
import { OptionalDate } from '../../../../../../../src/features/forms/OptionalDate';
import {
  leagueAdminQueryKey,
  transferLeaguePlayer,
  useLeaguePlayer,
  type PlayerMove,
} from '../../../../../../../src/features/league-admin/league-admin-api';
import { localToday } from '../../../../../../../src/features/stats/season-stats-api';
import { describeApiError } from '../../../../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/**
 * Assigns a free agent to a team or trades a player to another (the web Trade
 * dialog): the team, an optional effective date and a reason league members
 * can see. When their jersey number is taken there, the admin confirms
 * clearing it. League admins only; the server refuses a player in a live game.
 */
export default function MoveLeaguePlayerScreen() {
  const { leagueId = '', playerId = '' } = useLocalSearchParams<{ leagueId: string; playerId: string }>();
  const query = useLeaguePlayer(leagueId, playerId);
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();

  const [toTeamId, setToTeamId] = useState<string | null>(null);
  const [effectiveOn, setEffectiveOn] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [conflict, setConflict] = useState<{ jerseyNumber: number | null; name: string } | null>(null);

  const move = useMutation({
    mutationFn: (request: PlayerMove) => transferLeaguePlayer(leagueId, playerId, request),
    onSuccess: (result) => {
      if (result.status === 'jersey_conflict') {
        setConflict({ jerseyNumber: result.jerseyNumber, name: result.conflictingPlayerName });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: leagueAdminQueryKey(leagueId) });
      void triggerSync();
      router.back();
    },
  });

  const player = query.data?.player;
  const isAssignment = player?.teamId === null;
  const header = <Stack.Screen options={{ title: isAssignment ? 'Assign to a team' : 'Trade player' }} />;
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data || !player) {
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
        <EmptyState title="League admins only" message="Only league admins move players." />
      </View>
    );
  }

  const fullName = `${player.firstName} ${player.lastName}`;
  const teams = query.data.teams.filter((team) => team.teamId !== player.teamId);
  const pickTeam = (teamId: string | null) => {
    setToTeamId(teamId);
    setConflict(null);
  };
  const submit = () => {
    if (!toTeamId) return;
    move.mutate({
      toTeamId,
      effectiveAt: effectiveOn ? `${effectiveOn}T00:00:00.000Z` : undefined,
      reason: reason.trim() || undefined,
      acceptJerseyClear: conflict !== null,
    });
  };

  const label = move.isPending ? 'Saving…' : conflict ? 'Confirm & clear jersey' : isAssignment ? 'Confirm assignment' : 'Confirm trade';
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <Text className="text-xl font-bold text-gray-900">{isAssignment ? `Assign ${fullName}` : `Trade ${fullName}`}</Text>
        {!isAssignment && <Text className="text-sm text-gray-500 mt-1">Currently on {player.teamName ?? 'a team'}</Text>}

        <View className="mt-4">
          <FormField label={isAssignment ? 'Assign to team' : 'Move to team'} required>
            {teams.length === 0 ? (
              <Text className="text-sm text-gray-500">The league has no other active teams.</Text>
            ) : (
              <ChoiceChips
                options={teams.map((team) => team.teamId)}
                labels={Object.fromEntries(teams.map((team) => [team.teamId, team.name]))}
                selected={toTeamId ? [toTeamId] : []}
                onChange={(picked) => pickTeam(picked.find((value) => value !== toTeamId) ?? null)}
              />
            )}
          </FormField>
          <OptionalDate label="Effective date" value={effectiveOn} today={localToday()} onChange={setEffectiveOn} testID="move-effective" />
          <FormField label="Reason">
            <TextInput
              accessibilityLabel="Reason"
              className={`${inputClass} min-h-[72px]`}
              multiline
              textAlignVertical="top"
              placeholder="Optional, visible to league members"
              placeholderTextColor="#9ca3af"
              value={reason}
              onChangeText={setReason}
              maxLength={500}
            />
          </FormField>
        </View>

        {conflict && (
          <View className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2 mb-3">
            <Text className="text-sm text-amber-900">
              Jersey {conflict.jerseyNumber != null ? `#${conflict.jerseyNumber} ` : ''}is taken by {conflict.name} on that team. Confirm to clear{' '}
              {player.firstName}’s jersey on the move, then give them a new one.
            </Text>
          </View>
        )}
        {move.isError && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
            {describeApiError(move.error)}
          </Text>
        )}
        <Button label={label} loading={move.isPending} disabled={!toTeamId} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
