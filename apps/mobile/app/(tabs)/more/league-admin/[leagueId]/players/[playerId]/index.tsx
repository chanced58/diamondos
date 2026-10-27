import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Button, EmptyState, ErrorState, SectionHeader } from '@baseball/ui';
import { PLAYER_TRANSFER_TYPE_LABELS, type LeaguePlayerTransfer } from '@baseball/shared';
import { useLeaguePlayer } from '../../../../../../../src/features/league-admin/league-admin-api';
import { HAND_LABELS, POSITION_LABELS } from '../../../../../../../src/features/roster/player-form-model';
import { describeApiError, isApiError } from '../../../../../../../src/lib/api-client';

/** "Apr 2, 2010", read in the device's zone (a plain date). */
function plainDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const handLabel = (hand: string | null) => (hand ? HAND_LABELS[hand as keyof typeof HAND_LABELS] ?? hand : '—');

/**
 * A league player (the web League Players player page): their details and
 * transfer history. League admins assign or trade them to a team, or release
 * them into the free-agent pool.
 */
export default function LeaguePlayerScreen() {
  const { leagueId = '', playerId = '' } = useLocalSearchParams<{ leagueId: string; playerId: string }>();
  const query = useLeaguePlayer(leagueId, playerId);

  const player = query.data?.player;
  const header = <Stack.Screen options={{ title: player ? `${player.firstName} ${player.lastName}` : 'Player' }} />;
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data || !player) {
    const notFound = isApiError(query.error) && query.error.kind === 'not_found';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {notFound ? (
          <EmptyState title="Player not found" message="This player isn’t registered in the league." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const { canEdit, transfers } = query.data;
  const isFreeAgent = player.teamId === null;
  const facts: Array<[string, string]> = [
    ['Date of birth', player.dateOfBirth ? plainDate(player.dateOfBirth) : '—'],
    ['Graduation year', player.graduationYear != null ? String(player.graduationYear) : '—'],
    ['Primary position', player.primaryPosition ? POSITION_LABELS[player.primaryPosition as keyof typeof POSITION_LABELS] ?? player.primaryPosition : '—'],
    ['Bats / throws', `${handLabel(player.bats)} / ${handLabel(player.throws)}`],
  ];
  const go = (action: 'move' | 'release') =>
    router.push({
      pathname:
        action === 'move'
          ? '/(tabs)/more/league-admin/[leagueId]/players/[playerId]/move'
          : '/(tabs)/more/league-admin/[leagueId]/players/[playerId]/release',
      params: { leagueId, playerId },
    });

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <View className="flex-row items-baseline gap-2">
        <Text className="text-2xl font-bold text-gray-900">
          {player.firstName} {player.lastName}
        </Text>
        {player.jerseyNumber != null && <Text className="text-xl text-gray-400">#{player.jerseyNumber}</Text>}
      </View>
      <Text className={`text-sm mt-1 ${isFreeAgent ? 'text-amber-700 font-semibold' : 'text-gray-700'}`}>
        {player.teamName ?? 'Free agent'}
      </Text>

      <View className="bg-white rounded-xl border border-gray-200 p-4 mt-4 flex-row flex-wrap">
        {facts.map(([label, value]) => (
          <View key={label} className="w-1/2 mb-3">
            <Text className="text-xs font-medium text-gray-500 uppercase">{label}</Text>
            <Text className="text-sm text-gray-900 mt-0.5">{value}</Text>
          </View>
        ))}
      </View>

      {canEdit && (
        <View className="mt-4 gap-2">
          <Button label={isFreeAgent ? 'Assign to a team' : 'Trade to another team'} onPress={() => go('move')} />
          {!isFreeAgent && <Button label="Release to free agents" variant="danger" onPress={() => go('release')} />}
        </View>
      )}

      <SectionHeader title="Transfer history" />
      {transfers.length === 0 ? (
        <Text className="text-sm text-gray-500">No transfers recorded.</Text>
      ) : (
        <View className="bg-white rounded-xl border border-gray-200">
          {transfers.map((transfer, index) => (
            <TransferRow key={transfer.id} transfer={transfer} first={index === 0} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function TransferRow({ transfer, first }: { transfer: LeaguePlayerTransfer; first: boolean }) {
  const label = transfer.type ? PLAYER_TRANSFER_TYPE_LABELS[transfer.type] : 'Transfer';
  return (
    <View className={`px-4 py-3 ${first ? '' : 'border-t border-gray-100'}`}>
      <View className="flex-row justify-between gap-3">
        <Text className="flex-1 text-sm font-medium text-gray-900">
          {label}: {transfer.fromTeamName ?? '—'} → {transfer.toTeamName ?? 'Free agent'}
        </Text>
        <Text className="text-xs text-gray-500">{new Date(transfer.transferredAt).toLocaleDateString()}</Text>
      </View>
      {transfer.reason && <Text className="text-sm text-gray-700 mt-1">{transfer.reason}</Text>}
    </View>
  );
}
