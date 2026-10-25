import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@baseball/ui';
import { formatDate, formatTime, type PracticeRosterPlayer } from '@baseball/shared';
import { generatePracticeSummary, practiceSummaryQueryKey, usePracticeSummary } from './planning-api';
import { describeApiError } from '../../lib/api-client';

/**
 * The AI post-practice summary (the web Summary section), for coaches: the
 * recap, standouts, concerns and a line per player, with a button to
 * generate or regenerate it.
 */
export function SummaryCard({ practiceId, players }: { practiceId: string; players: PracticeRosterPlayer[] }) {
  const queryClient = useQueryClient();
  const query = usePracticeSummary(practiceId);
  const [showPlayers, setShowPlayers] = useState(false);
  const generate = useMutation({
    mutationFn: () => generatePracticeSummary(practiceId),
    onSuccess: (result) => queryClient.setQueryData(practiceSummaryQueryKey(practiceId), result),
  });

  const name = (playerId: string | null) => {
    const player = players.find((p) => p.id === playerId);
    return player ? `${player.firstName} ${player.lastName}` : null;
  };
  const summary = query.data?.summary ?? null;

  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-gray-900">AI practice summary</Text>
        {summary && (
          <Text className="text-xs text-gray-400">
            {formatDate(summary.generatedAt)} · {formatTime(summary.generatedAt)}
          </Text>
        )}
      </View>

      {query.isPending ? (
        <ActivityIndicator />
      ) : query.isError ? (
        <Text className="text-sm text-red-700 mb-2">{describeApiError(query.error)}</Text>
      ) : !summary ? (
        <Text className="text-sm text-gray-500 mb-3">
          Claude reads the blocks, reps, attendance and notes and writes a recap with standouts and concerns.
        </Text>
      ) : (
        <View className="mb-3">
          <Text className="text-sm text-gray-800 mb-2">{summary.coachRecap}</Text>
          {summary.standoutPlayers.length > 0 && (
            <View className="mb-2">
              <Text className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Standouts</Text>
              {summary.standoutPlayers.map((s) => (
                <Text key={s.playerId} className="text-sm text-gray-800 mb-0.5">
                  <Text className="font-medium">{name(s.playerId) ?? 'A player'}</Text> — {s.reason}
                </Text>
              ))}
            </View>
          )}
          {summary.concerns.length > 0 && (
            <View className="mb-2">
              <Text className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Concerns</Text>
              {summary.concerns.map((c, index) => (
                <Text key={`${c.playerId ?? 'team'}-${index}`} className="text-sm text-gray-800 mb-0.5">
                  {name(c.playerId) ? <Text className="font-medium">{name(c.playerId)} — </Text> : null}
                  {c.note}
                </Text>
              ))}
            </View>
          )}
          {Object.keys(summary.playerSummaries).length > 0 && (
            <>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showPlayers }} onPress={() => setShowPlayers(!showPlayers)}>
                <Text className="text-sm font-semibold text-brand-700">
                  {showPlayers ? 'Hide' : 'Show'} each player ({Object.keys(summary.playerSummaries).length})
                </Text>
              </TouchableOpacity>
              {showPlayers &&
                Object.entries(summary.playerSummaries).map(([playerId, line]) => (
                  <Text key={playerId} className="text-sm text-gray-800 mt-1">
                    <Text className="font-medium">{name(playerId) ?? 'Player'}:</Text> {line}
                  </Text>
                ))}
            </>
          )}
        </View>
      )}

      {generate.isError && <Text accessibilityRole="alert" className="text-xs text-red-700 mb-2">{describeApiError(generate.error)}</Text>}
      <Button
        label={generate.isPending ? 'Writing… (up to a minute)' : summary ? 'Regenerate summary' : 'Generate summary'}
        variant={summary ? 'secondary' : 'primary'}
        loading={generate.isPending}
        disabled={generate.isPending}
        onPress={() => generate.mutate()}
      />
    </View>
  );
}
